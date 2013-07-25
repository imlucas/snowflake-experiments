#define BUILDING_NODE_EXTENSION
#include <node.h>
#include <time.h>
#include <iostream.h>
#include "snowflake.h"

using namespace v8;

const long EPOCH = 1288834974657L;

705681a8219d

const long SEQUENCE_BITS = 12L;
const long SEQUENCE_MASK = -1L ^ (-1L << SEQUENCE_BITS);
const long MAX_SEQUENCE = (1 << SEQUENCE_BITS) - 1;

const long WORKER_ID_BITS = 5L;
const long WORKER_ID_SHIFT = 12L;
const long MAX_WORKER_ID = -1L ^ (-1L << WORKER_ID_BITS);

const long DATACENTER_ID_BITS = 5L;
const long DATACENTER_ID_SHIFT = SEQUENCE_BITS + WORKER_ID_BITS;
const long MAX_DATACENTER_ID = -1L ^ (-1L << DATACENTER_ID_BITS);

const long TIMESTAMP_SHIFT = SEQUENCE_BITS + WORKER_ID_BITS + DATACENTER_ID_BITS;


const long WORKER_MASK = 0x000000000001F000L;
const long DATACENTER_MASK = 0x00000000003E0000L;
const long TIMESTAMP_MASK = 0xFFFFFFFFFFC00000L;

// ltoa from the stdlib.
// we'll need this for casting longs in C lang
// to strings so they can be used in javascript land.
static char* ltoa(unsigned long n, char *s, int radix){
  long q, r;
  long i = 0, j;
  char tmp[65]; // worst case: base-2 of a 64-bit positive integer

  do {
    q = long(n / radix);
    r = n % radix;
    n = q;
    tmp[i++] = 48 + r; // 48 is decimal for ASCII 0
  } while(q > 0);

  for(j = 0; j < i; j++) {
    s[j] = tmp[i - j - 1];
  }

  s[j] = '\0';

  return s;
}

IdWorker::IdWorker(unsigned long workerId, unsigned long datacenterId) {
  workerId_ = workerId;
  datacenterId_ = datacenterId;
  sequence_ = 0L;
  lastTimestamp_ = 0L;
};

IdWorker::~IdWorker() {};

unsigned long IdWorker::getNextId(){
    unsigned long timestamp = this->getTimestamp();

    if(timestamp < lastTimestamp_){
      // clock moved backwards
      return 0L;
    }

    if(lastTimestamp_ == timestamp){
      sequence_ = (sequence_ + 1) & SEQUENCE_MASK;
      // we are out of space on the sequence block so we need to
      // wait for the clock to turn over.
      if(sequence_ == 0) {
        timestamp = this->tilNextMillis(lastTimestamp_);
      }
    } else {
      sequence_ = 0;
    }

    lastTimestamp_ = timestamp;

    unsigned long id = ((timestamp - EPOCH) << TIMESTAMP_SHIFT)
      | (datacenterId_ << DATACENTER_ID_SHIFT)
      | (workerId_ << WORKER_ID_SHIFT)
      | sequence_;
    return id;
}


unsigned long IdWorker::getTimestamp(){
  time_t now = time(NULL) * 1000;
  return now;
}

unsigned long IdWorker::tilNextMillis(unsigned long lastTimestamp){
  unsigned long timestamp = this->getTimestamp();
  while(lastTimestamp < timestamp){
    timestamp = this->getTimestamp();
  }
  return timestamp;
}

unsigned long IdWorker::UnpackWorkerId(unsigned long id){
  return (id & WORKER_MASK) >> SEQUENCE_BITS;
}

unsigned long IdWorker::UnpackDatacenterId(unsigned long id){
  return (id & DATACENTER_MASK) >> DATACENTER_ID_SHIFT;
}

unsigned long IdWorker::UnpackTimestamp(unsigned long id){
  return ((id & TIMESTAMP_MASK) >> TIMESTAMP_SHIFT) + EPOCH;
}

unsigned long IdWorker::UnpackSequence(unsigned long id){
  return id & SEQUENCE_MASK;
}

// export IdWorker
// really what this does is wired C++ land to js land.
void IdWorker::Init(Handle<Object> exports) {
  // Prepare constructor template
  Local<FunctionTemplate> tpl = FunctionTemplate::New(New);
  tpl->SetClassName(String::NewSymbol("IdWorker"));
  tpl->InstanceTemplate()->SetInternalFieldCount(1);

  // Prototype
  tpl->PrototypeTemplate()->Set(String::NewSymbol("getNextId"),
      FunctionTemplate::New(GetNextId)->GetFunction());

  tpl->PrototypeTemplate()->Set(String::NewSymbol("setTime"),
      FunctionTemplate::New(SetTime)->GetFunction());

  tpl->PrototypeTemplate()->Set(String::NewSymbol("unpack"),
      FunctionTemplate::New(Unpack)->GetFunction());

  Persistent<Function> constructor = Persistent<Function>::New(tpl->GetFunction());
  exports->Set(String::NewSymbol("IdWorker"), constructor);
}

// create a new instance of IdWorker
Handle<Value> IdWorker::New(const Arguments& args){
  HandleScope scope;
  IdWorker* obj = new IdWorker(args[0]->NumberValue(), args[1]->NumberValue());
  obj->Wrap(args.This());
  return args.This();
}

// hey actually do something!
Handle<Value> IdWorker::GetNextId(const Arguments& args){
  HandleScope scope;

  IdWorker* obj = ObjectWrap::Unwrap<IdWorker>(args.This());

  // timing
  // int start;
  // int stop;
  // double total;
  // start = clock();
  unsigned long id = obj->getNextId();

  // stop = clock();
  // total = ((float)stop - (float)start);

  if(id == 0L){
    return v8::ThrowException(v8::String::New("clock moved backwards"));
  }
  // debugging
  // std::cout << "********************************************************\n";
  // std::cout << "new snowflake \n\n";
  // std::cout << "** "<< id << " ** \n";
  // std::cout << "worker    \n";
  // std::cout << "           unpacked   " << UnpackWorkerId(id) << "\n";
  // std::cout << "           expected   " << obj->workerId_ << "\n";

  // std::cout << "datacenter\n";
  // std::cout << "           unpacked   " << UnpackDatacenterId(id) << "\n";
  // std::cout << "           expected   " << obj->datacenterId_ << "\n";

  // std::cout << "sequence  \n";
  // std::cout << "           unpacked   " << UnpackSequence(id) << "\n";
  // std::cout << "           expected   " << obj->sequence_ << "\n";

  // std::cout << "timestamp \n";
  // std::cout << "           unpacked   " << UnpackTimestamp(id) << "\n";
  // std::cout << "           expected   " << obj->lastTimestamp_ << "\n";
  // std::cout << total << " microseconds \n";
  // std::cout << "********************************************************\n";

  char idString[65];
  ltoa(id, &idString[0], 10);

  return scope.Close(String::New(idString));
}

// just for testing from js
Handle<Value> IdWorker::SetTime(const Arguments& args){
  HandleScope scope;
  IdWorker* obj = ObjectWrap::Unwrap<IdWorker>(args.This());
  obj->time_ = args[0]->NumberValue();
  return scope.Close(Number::New(obj->time_));
}

// just for testing from js
Handle<Value> IdWorker::SetSequence(const Arguments& args){
  HandleScope scope;
  IdWorker* obj = ObjectWrap::Unwrap<IdWorker>(args.This());
  obj->sequence_ = args[0]->NumberValue();
  return scope.Close(Number::New(obj->sequence_));
}

// return an Object with the unpacked components of an id
// in a readable form.
Handle<Value> IdWorker::Unpack(const Arguments& args){
  HandleScope scope;

  // get the id string out and cast back to a long.
  const char *idStr = *v8::String::Utf8Value(args[0]->ToString());
  unsigned long id = strtol(idStr, (char **) NULL, 10);

  // unpack the properties we care about.
  Local<Object> res = Object::New();
  res->Set(String::NewSymbol("id"), args[0]->ToString());
  res->Set(String::NewSymbol("datacenterId"), Number::New(UnpackDatacenterId(id)));
  res->Set(String::NewSymbol("workerId"), Number::New(UnpackWorkerId(id)));
  res->Set(String::NewSymbol("sequence"), Number::New(UnpackSequence(id)));
  res->Set(String::NewSymbol("timestamp"), Number::New(UnpackTimestamp(id)));
  return scope.Close(res);
}
