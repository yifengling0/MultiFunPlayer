#include "recording_store.h"
#include <array>
#include <cerrno>
#include <cstring>
#include <fcntl.h>
#include <map>
#include <memory>
#include <mutex>
#include <sys/random.h>
#include <sys/stat.h>
#include <unistd.h>
namespace mfp { namespace {
struct Entry {
    int dir = -1, fd = -1;
    dev_t dev = 0; ino_t ino = 0;
    bool failed = false, flushed = false, published = false;
    std::string finalName, partial;
    ~Entry() { if (fd >= 0) ::close(fd); if (dir >= 0) ::close(dir); }
};
std::mutex mutex;
std::map<std::string, std::unique_ptr<Entry>> entries;
bool Valid(const std::string& s) {
    if (s.empty() || s.size() > 160 || s[0] == '.' || s.find("..") != std::string::npos) return false;
    for (unsigned char c : s) if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == '-' || c == '.')) return false;
    return (s.size() > 4 && s.compare(s.size()-4,4,".csv") == 0) || (s.size() > 10 && s.compare(s.size()-10,10,".funscript") == 0);
}
int OpenRoot(const std::string& path, bool requirePrivate = true) {
    if (path.empty() || path[0] != '/' || path.size() > 4096 || path.find('\0') != std::string::npos) { errno = EINVAL; return -1; }
    int fd = open("/", O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
    if (fd < 0) return -1;
    size_t pos = 1;
    while (pos < path.size()) {
        size_t end = path.find('/',pos); if (end == std::string::npos) end = path.size();
        const size_t length = end-pos;
        if (length == 0 || length > 255 || (length == 1 && path[pos] == '.') ||
            (length == 2 && path[pos] == '.' && path[pos+1] == '.')) { ::close(fd); errno=EINVAL; return -1; }
        char component[256]{}; memcpy(component,path.data()+pos,length);
        int next = openat(fd,component,O_RDONLY|O_DIRECTORY|O_CLOEXEC|O_NOFOLLOW);
        int error = errno; ::close(fd); if (next < 0) { errno=error; return -1; } fd=next; pos=end+1;
    }
    struct stat st{};
    if (fstat(fd,&st) != 0) { int e=errno; ::close(fd); errno=e; return -1; }
    // The trusted adapter supplies its app-owned namespace, never a public directory.
    if (requirePrivate && (st.st_uid != getuid() || (st.st_mode & 0022) != 0)) { ::close(fd); errno=EACCES; return -1; }
    return fd;
}
int CloseEntry(Entry& e) {
    if (e.fd < 0) return e.failed ? EIO : 0;
    int fd=e.fd; e.fd=-1; // Never retry close: EINTR may already have consumed the descriptor.
    if (::close(fd) != 0) { e.failed=true; return errno; } return e.failed ? EIO : 0;
}
Entry* Get(const std::string& token) { auto it=entries.find(token); return it == entries.end() ? nullptr : it->second.get(); }
int Identity(Entry& e) {
    struct stat st{};
    if (fstatat(e.dir,e.partial.c_str(),&st,AT_SYMLINK_NOFOLLOW) != 0) return errno;
    return S_ISREG(st.st_mode) && st.st_dev == e.dev && st.st_ino == e.ino ? 0 : ESTALE;
}
}
int PrepareRoot(const std::string& root,std::string& result) noexcept {try{
    if(root.empty() || root.back()=='/' || root.size()>4080)return EINVAL;
    result=root+"/recordings"; // Allocate before creating anything.
    int dir=OpenRoot(root,false);if(dir<0)return errno;
    if(mkdirat(dir,"recordings",0700)!=0 && errno!=EEXIST){int error=errno;::close(dir);return error;}
    int child=openat(dir,"recordings",O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC);
    int error=errno;::close(dir);if(child<0)return error;
    struct stat st{};int status=fstat(child,&st);error=errno;
    if(status==0 && (st.st_uid!=getuid() || (st.st_mode&0022)!=0)){status=-1;error=EACCES;}
    int closed=::close(child);if(status!=0)return error;if(closed!=0)return errno;return 0;
}catch(...){return ENOMEM;}}
int Create(const std::string& root,const std::string& name,std::string& token) noexcept { try {
    std::lock_guard<std::mutex> lock(mutex);
    if (!Valid(name)) return EINVAL;
    if (entries.size() >= 64) return EMFILE;
    auto e=std::make_unique<Entry>(); e->finalName=name; e->partial=name+".partial";
    e->dir=OpenRoot(root); if (e->dir < 0) return errno;
    std::array<unsigned char,16> random{};
    size_t got=0; while (got<random.size()) { ssize_t n=getrandom(random.data()+got,random.size()-got,0); if(n<0){if(errno==EINTR)continue;return errno;} if(n==0)return EIO; got+=static_cast<size_t>(n); }
    std::string key; key.reserve(32); const char* hex="0123456789abcdef";
    for(auto v:random){key.push_back(hex[v>>4]);key.push_back(hex[v&15]);}
    if(entries.count(key))return EAGAIN;
    // Reserve all allocating metadata before the filesystem side effect.
    token=key; auto inserted=entries.emplace(key,std::move(e)); Entry& item=*inserted.first->second;
    struct stat finalStat{};
    if(fstatat(item.dir,name.c_str(),&finalStat,AT_SYMLINK_NOFOLLOW)==0){entries.erase(key);return EEXIST;}
    if(errno!=ENOENT){int err=errno;entries.erase(key);return err;}
    item.fd=openat(item.dir,item.partial.c_str(),O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW|O_CLOEXEC,0600);
    if(item.fd<0){int err=errno;entries.erase(key);return err;}
    struct stat st{}; if(fstat(item.fd,&st)!=0){int err=errno;entries.erase(key);return err;}
    item.dev=st.st_dev; item.ino=st.st_ino; return 0;
} catch (...) { return ENOMEM; } }
int Write(const std::string& token,const unsigned char* data,size_t size,size_t& written) noexcept { try {
    std::lock_guard<std::mutex> lock(mutex); written=0; auto* e=Get(token); if(!e)return EBADF;
    if(e->fd<0 || e->failed)return EIO;
    if(size>MAX_WRITE || (size && !data))return EINVAL;
    e->flushed=false;
    while(written<size){ssize_t n=::write(e->fd,data+written,size-written);if(n<0){if(errno==EINTR)continue;e->failed=true;return errno;}if(n==0){e->failed=true;return EIO;}written+=static_cast<size_t>(n);}return 0;
} catch (...) { return ENOMEM; } }
int Flush(const std::string& token) noexcept { try { std::lock_guard<std::mutex> lock(mutex);auto* e=Get(token);if(!e)return EBADF;if(e->failed||e->fd<0)return EIO;if(fsync(e->fd)!=0){e->failed=true;return errno;}e->flushed=true;return 0;} catch (...) {return ENOMEM;} }
int Close(const std::string& token) noexcept {try{std::lock_guard<std::mutex> lock(mutex);auto* e=Get(token);return e?CloseEntry(*e):EBADF;}catch(...){return ENOMEM;}}
int Finalize(const std::string& token,std::string& name) noexcept {try{
    std::lock_guard<std::mutex> lock(mutex);auto* e=Get(token);if(!e)return EBADF;
    if(e->failed || !e->flushed || e->fd>=0 || e->published)return EIO;
    int check=Identity(*e);if(check)return check;
    name=e->finalName;
    // linkat is atomic no-replace publication. Never fall back to overwrite rename.
    if(linkat(e->dir,e->partial.c_str(),e->dir,e->finalName.c_str(),0)!=0)return errno;
    e->published=true;
    // On any following failure a final may exist: preserve both and report EUCLEAN.
    if(fsync(e->dir)!=0)return EUCLEAN;
    // Keep the recovery alias even on success. No path-based deletion can
    // safely guarantee ownership after a concurrent directory entry change.
    return 0;
}catch(...){return ENOMEM;}}
int Abort(const std::string& token) noexcept {try{std::lock_guard<std::mutex> lock(mutex);auto it=entries.find(token);if(it==entries.end())return EBADF;int error=CloseEntry(*it->second);entries.erase(it);return error;}catch(...){return ENOMEM;}}
int Release(const std::string& token) noexcept {return Abort(token);}
}
