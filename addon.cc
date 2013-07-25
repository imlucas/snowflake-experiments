#define BUILDING_NODE_EXTENSION
#include <node.h>
#include "snowflake.h"

using namespace v8;

void InitAll(Handle<Object> exports) {
  IdWorker::Init(exports);
}

NODE_MODULE(addon, InitAll)