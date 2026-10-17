#include "recording_store.h"
#include "napi/native_api.h"
#include <atomic>
#include <cerrno>
#include <cstdio>
#include <memory>
#include <string>
#include <vector>
namespace {
enum class Op { PrepareRoot, Create, Write, Flush, Close, Finalize, Abort, Release };
struct Work { napi_async_work work=nullptr; napi_deferred deferred=nullptr; Op op; std::string first,second,result; std::vector<unsigned char> bytes; size_t written=0; int error=0; };
std::atomic<unsigned> pending{0};
napi_value Error(napi_env env,int error) {
    char code[24]; snprintf(code,sizeof(code),"%d",error);
    napi_value c=nullptr,m=nullptr,e=nullptr;
    napi_create_string_utf8(env,code,NAPI_AUTO_LENGTH,&c);
    napi_create_string_utf8(env,error==EUCLEAN ? "Recording published; recovery required" : "Recording operation failed; partial files preserved",NAPI_AUTO_LENGTH,&m);
    napi_create_error(env,c,m,&e); return e;
}
void Execute(napi_env,void* data) noexcept {
    auto& w=*static_cast<Work*>(data);
    switch(w.op){
        case Op::PrepareRoot:w.error=mfp::PrepareRoot(w.first,w.result);break;
        case Op::Create:w.error=mfp::Create(w.first,w.second,w.result);break;
        case Op::Write:w.error=mfp::Write(w.first,w.bytes.data(),w.bytes.size(),w.written);break;
        case Op::Flush:w.error=mfp::Flush(w.first);break;
        case Op::Close:w.error=mfp::Close(w.first);break;
        case Op::Finalize:w.error=mfp::Finalize(w.first,w.result);break;
        case Op::Abort:w.error=mfp::Abort(w.first);break;
        case Op::Release:w.error=mfp::Release(w.first);break;
    }
}
void Complete(napi_env env,napi_status status,void* data) noexcept {
    std::unique_ptr<Work> w(static_cast<Work*>(data));
    napi_value value=nullptr; napi_status made=napi_ok;
    if(status!=napi_ok && !w->error)w->error=ECANCELED;
    if(!w->error){
        if(w->op==Op::PrepareRoot||w->op==Op::Create||w->op==Op::Finalize)made=napi_create_string_utf8(env,w->result.data(),w->result.size(),&value);
        else if(w->op==Op::Write)made=napi_create_uint32(env,static_cast<uint32_t>(w->written),&value);
        else made=napi_get_undefined(env,&value);
        if(made!=napi_ok)w->error=EIO;
    }
    if(w->error)napi_reject_deferred(env,w->deferred,Error(env,w->error));
    else napi_resolve_deferred(env,w->deferred,value);
    napi_delete_async_work(env,w->work); --pending;
}
bool String(napi_env env,napi_value arg,size_t max,std::string& out) {
    size_t len=0,copied=0; napi_valuetype type;
    if(napi_typeof(env,arg,&type)!=napi_ok||type!=napi_string||napi_get_value_string_utf8(env,arg,nullptr,0,&len)!=napi_ok||len==0||len>max)return false;
    std::vector<char> buf(len+1);
    if(napi_get_value_string_utf8(env,arg,buf.data(),buf.size(),&copied)!=napi_ok||copied!=len)return false;
    out.assign(buf.data(),len);return out.find('\0')==std::string::npos;
}
napi_value Dispatch(napi_env env,napi_callback_info info) noexcept { try {
    napi_value args[3]{}; size_t argc=3; void* method=nullptr;
    if(napi_get_cb_info(env,info,&argc,args,nullptr,&method)!=napi_ok)return nullptr;
    auto w=std::make_unique<Work>(); w->op=*static_cast<Op*>(method);
    size_t expected=(w->op==Op::Create||w->op==Op::Write)?2:1;
    bool valid=argc==expected && String(env,args[0],(w->op==Op::Create||w->op==Op::PrepareRoot)?4096:32,w->first);
    if(valid&&w->op==Op::Create)valid=String(env,args[1],160,w->second);
    if(valid&&w->op==Op::Write){
        napi_typedarray_type type;size_t len=0,offset=0;void* data=nullptr;napi_value array=nullptr;
        valid=napi_get_typedarray_info(env,args[1],&type,&len,&data,&array,&offset)==napi_ok && type==napi_uint8_array && len<=mfp::MAX_WRITE && (!len||data);
        if(valid&&len){auto* bytes=static_cast<unsigned char*>(data);w->bytes.assign(bytes,bytes+len);}
    }
    if(!valid){napi_throw_type_error(env,nullptr,"Invalid bounded recording arguments");return nullptr;}
    if(pending.fetch_add(1)>=64){--pending;napi_throw_error(env,nullptr,"Recording operation queue is full");return nullptr;}
    napi_value promise=nullptr,name=nullptr;
    if(napi_create_promise(env,&w->deferred,&promise)!=napi_ok){--pending;return nullptr;}
    if(napi_create_string_utf8(env,"mfpRecording",NAPI_AUTO_LENGTH,&name)!=napi_ok || napi_create_async_work(env,nullptr,name,Execute,Complete,w.get(),&w->work)!=napi_ok || napi_queue_async_work(env,w->work)!=napi_ok){
        napi_reject_deferred(env,w->deferred,Error(env,EAGAIN));if(w->work)napi_delete_async_work(env,w->work);--pending;
    }else w.release();
    return promise;
}catch(...){napi_throw_error(env,nullptr,"Recording allocation failed");return nullptr;}}
napi_value Init(napi_env env,napi_value exports) {
    static Op ops[]={Op::PrepareRoot,Op::Create,Op::Write,Op::Flush,Op::Close,Op::Finalize,Op::Abort,Op::Release};
    const char* names[]={"prepareRoot","create","write","flush","close","finalize","abort","release"};
    napi_property_descriptor descriptors[8]{};
    for(size_t i=0;i<8;++i){descriptors[i].utf8name=names[i];descriptors[i].method=Dispatch;descriptors[i].attributes=napi_default;descriptors[i].data=&ops[i];}
    return napi_define_properties(env,exports,8,descriptors)==napi_ok?exports:nullptr;
}
napi_module module={1,0,nullptr,Init,"mfp_recording",nullptr,{nullptr}};
}
extern "C" __attribute__((constructor)) void RegisterMfpRecordingModule() { napi_module_register(&module); }
