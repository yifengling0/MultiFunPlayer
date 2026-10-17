#include "recording_store.h"
#include <cassert>
#include <cerrno>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sys/stat.h>
#include <unistd.h>
static int writeMode=0,closeFailure=0,closeCalls=0,syncFailure=0;
extern "C" ssize_t __real_write(int,const void*,size_t);
extern "C" int __real_close(int);
extern "C" int __real_fsync(int);
extern "C" ssize_t __wrap_write(int fd,const void* data,size_t size) {
    if(writeMode==1){writeMode=2;errno=EINTR;return -1;}
    if(writeMode==2)return __real_write(fd,data,size>3?3:size);
    if(writeMode==3)return 0;
    if(writeMode==4){errno=ENOSPC;return -1;}
    return __real_write(fd,data,size);
}
extern "C" int __wrap_close(int fd) {
    ++closeCalls;int result=__real_close(fd);
    if(closeFailure){closeFailure=0;errno=EINTR;return -1;}return result;
}
extern "C" int __wrap_fsync(int fd) {if(syncFailure){syncFailure=0;errno=EIO;return -1;}return __real_fsync(fd);}
static std::string Read(const std::string& file){std::ifstream f(file);return std::string(std::istreambuf_iterator<char>(f),{});}
int main(){
    char pattern[]="/tmp/mfp-recording-test-XXXXXX";char* tmp=mkdtemp(pattern);assert(tmp);std::string root=tmp;
    std::string prepared;
    chmod(root.c_str(),0777); // Shared parent is allowed; our child must be private.
    assert(mfp::PrepareRoot(root,prepared)==0&&prepared==root+"/recordings");
    chmod(root.c_str(),0700);
    assert(mfp::PrepareRoot(root,prepared)==0);
    std::filesystem::remove(root+"/recordings");
    std::filesystem::create_directory_symlink(root,root+"/recordings");
    assert(mfp::PrepareRoot(root,prepared)!=0);
    std::filesystem::remove(root+"/recordings");
    std::string token,other,name;size_t written=0;const unsigned char payload[]="abcdefghijk";
    for(const auto& bad:{"../escape.csv","a/b.csv",".hidden.csv","a..csv","line\n.csv","a.txt"})assert(mfp::Create(root,bad,token)==EINVAL);
    assert(mfp::Create(root,"valid.L0.funscript",token)==0);assert(mfp::Abort(token)==0);
    std::filesystem::create_directory_symlink(root,root+"-link");assert(mfp::Create(root+"-link","safe.csv",token)!=0);std::filesystem::remove(root+"-link");
    assert(mfp::Create(root+"/../"+std::filesystem::path(root).filename().string(),"safe.csv",token)==EINVAL);
    chmod(root.c_str(),0777);assert(mfp::Create(root,"safe.csv",token)==EACCES);chmod(root.c_str(),0700);
    std::ofstream(root+"/outside")<<"untouched";std::filesystem::create_symlink("outside",root+"/symlink.csv.partial");assert(mfp::Create(root,"symlink.csv",token)==EEXIST);assert(Read(root+"/outside")=="untouched");
    assert(mfp::Create(root,"short.csv",token)==0);assert(token.size()==32);assert(mfp::Create(root,"short.csv",other)==EEXIST);
    writeMode=1;assert(mfp::Write(token,payload,11,written)==0&&written==11);writeMode=0;
    assert(mfp::Write(token,payload,mfp::MAX_WRITE+1,written)==EINVAL);
    assert(mfp::Flush(token)==0);assert(mfp::Close(token)==0);assert(mfp::Close(token)==0);
    assert(mfp::Finalize(token,name)==0&&name=="short.csv");assert(Read(root+"/short.csv")=="abcdefghijk");assert(Read(root+"/short.csv.partial")=="abcdefghijk");assert(mfp::Release(token)==0);assert(mfp::Write(token,payload,1,written)==EBADF);
    assert(mfp::Create(root,"short.csv",other)==EEXIST);
    assert(mfp::Create(root,"collision.csv",token)==0);assert(mfp::Write(token,payload,11,written)==0);assert(mfp::Flush(token)==0);assert(mfp::Close(token)==0);std::ofstream(root+"/collision.csv")<<"existing";assert(mfp::Finalize(token,name)==EEXIST);assert(mfp::Abort(token)==0);assert(Read(root+"/collision.csv")=="existing");assert(Read(root+"/collision.csv.partial")=="abcdefghijk");
    assert(mfp::Create(root,"swap.csv",token)==0);assert(mfp::Flush(token)==0);assert(mfp::Close(token)==0);std::filesystem::rename(root+"/swap.csv.partial",root+"/original");std::ofstream(root+"/swap.csv.partial")<<"replacement";assert(mfp::Finalize(token,name)==ESTALE);assert(mfp::Abort(token)==0);assert(Read(root+"/swap.csv.partial")=="replacement");
    assert(mfp::Create(root,"close.csv",token)==0);assert(mfp::Flush(token)==0);int before=closeCalls;closeFailure=1;assert(mfp::Close(token)==EINTR);assert(closeCalls==before+1);assert(mfp::Close(token)==EIO);assert(closeCalls==before+1);assert(mfp::Finalize(token,name)==EIO);assert(mfp::Abort(token)==EIO);assert(closeCalls==before+2);assert(std::filesystem::exists(root+"/close.csv.partial"));
    assert(mfp::Create(root,"zero.csv",token)==0);writeMode=3;assert(mfp::Write(token,payload,11,written)==EIO);writeMode=0;assert(mfp::Flush(token)==EIO);assert(mfp::Abort(token)==EIO);
    assert(mfp::Create(root,"space.csv",token)==0);writeMode=4;assert(mfp::Write(token,payload,11,written)==ENOSPC);writeMode=0;assert(mfp::Abort(token)==EIO);
    assert(mfp::Create(root,"sync.csv",token)==0);syncFailure=1;assert(mfp::Flush(token)==EIO);assert(mfp::Close(token)==EIO);assert(mfp::Finalize(token,name)==EIO);assert(mfp::Abort(token)==EIO);
    assert(mfp::Create(root,"published.csv",token)==0);assert(mfp::Flush(token)==0);assert(mfp::Close(token)==0);syncFailure=1;assert(mfp::Finalize(token,name)==EUCLEAN);assert(std::filesystem::exists(root+"/published.csv"));assert(std::filesystem::exists(root+"/published.csv.partial"));assert(mfp::Abort(token)==0);assert(std::filesystem::exists(root+"/published.csv"));
    // An open root capability stays pinned even if its path is moved/replaced.
    assert(mfp::Create(root,"pinned.csv",token)==0);std::filesystem::rename(root,root+"-moved");std::filesystem::create_directory(root);chmod(root.c_str(),0700);assert(mfp::Flush(token)==0);assert(mfp::Close(token)==0);assert(mfp::Finalize(token,name)==0);assert(mfp::Release(token)==0);assert(std::filesystem::exists(root+"-moved/pinned.csv"));assert(!std::filesystem::exists(root+"/pinned.csv"));
    std::filesystem::remove_all(root);std::filesystem::remove_all(root+"-moved");
    std::cout<<"PASS: traversal, symlinks, root ownership/mode, exclusive collisions, no-replace publication, inode substitution, short writes/EINTR, zero/ENOSPC, stale handles, close-once, fsync failure, partial publication, pinned directory\n";
}
