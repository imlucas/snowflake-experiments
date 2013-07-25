#ifndef SNOWFLAKE_H
#define SNOWFLAKE_H

#include <node.h>

class IdWorker : public node::ObjectWrap {
 public:
    static void Init(v8::Handle<v8::Object> exports);
    static unsigned long UnpackWorkerId(unsigned long id);
    static unsigned long UnpackDatacenterId(unsigned long id);
    static unsigned long UnpackTimestamp(unsigned long id);
    static unsigned long UnpackSequence(unsigned long id);

    unsigned long LastTimestamp() const { return lastTimestamp_; }
    unsigned long getTimestamp();
    unsigned long tilNextMillis(unsigned long lastTimestamp);
    unsigned long getNextId();


 private:
    IdWorker(unsigned long workerId, unsigned long datacenterId);
    ~IdWorker();

    unsigned long workerId_;
    unsigned long datacenterId_;
    unsigned long lastTimestamp_;
    unsigned long sequence_;
    unsigned long time_;

    static v8::Handle<v8::Value> New(const v8::Arguments& args);
    static v8::Handle<v8::Value> GetNextId(const v8::Arguments& args);
    static v8::Handle<v8::Value> SetTime(const v8::Arguments& args);
    static v8::Handle<v8::Value> SetSequence(const v8::Arguments& args);
    static v8::Handle<v8::Value> Unpack(const v8::Arguments& args);
};

#endif