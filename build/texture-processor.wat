(module
 (type $0 (func (result f64)))
 (type $1 (func (param i32) (result i32)))
 (type $2 (func (param i32 i32 i32 i32)))
 (type $3 (func (param i64) (result i64)))
 (type $4 (func (param i32 i32 i32 i32 f32)))
 (type $5 (func (param i32 i32 i32 i32 i32 i32 i32 f32)))
 (type $6 (func (param i32)))
 (type $7 (func (result i32)))
 (type $8 (func))
 (import "texture-processor" "__heap_base" (global $src/wasm/texture-processor/__heap_base i32))
 (import "env" "seed" (func $~lib/builtins/seed (result f64)))
 (import "env" "abort" (func $~lib/builtins/abort (param i32 i32 i32 i32)))
 (global $~lib/math/random_seeded (mut i32) (i32.const 0))
 (global $~lib/math/random_state0_64 (mut i64) (i64.const 0))
 (global $~lib/math/random_state1_64 (mut i64) (i64.const 0))
 (global $~lib/math/random_state0_32 (mut i32) (i32.const 0))
 (global $~lib/rt/stub/offset (mut i32) (i32.const 0))
 (memory $0 1)
 (data $0 (i32.const 1036) "<")
 (data $0.1 (i32.const 1048) "\02\00\00\00(\00\00\00A\00l\00l\00o\00c\00a\00t\00i\00o\00n\00 \00t\00o\00o\00 \00l\00a\00r\00g\00e")
 (data $1 (i32.const 1100) "<")
 (data $1.1 (i32.const 1112) "\02\00\00\00\1e\00\00\00~\00l\00i\00b\00/\00r\00t\00/\00s\00t\00u\00b\00.\00t\00s")
 (export "__heap_base" (global $src/wasm/texture-processor/__heap_base))
 (export "processNodePositions" (func $src/wasm/texture-processor/processNodePositions))
 (export "processLinks" (func $src/wasm/texture-processor/processLinks))
 (export "processTextures" (func $src/wasm/texture-processor/processTextures))
 (export "allocateMemory" (func $src/wasm/texture-processor/allocateMemory))
 (export "freeMemory" (func $src/wasm/texture-processor/freeMemory))
 (export "getMemoryUsage" (func $src/wasm/texture-processor/getMemoryUsage))
 (export "memory" (memory $0))
 (start $~start)
 (func $~lib/math/murmurHash3 (param $0 i64) (result i64)
  local.get $0
  local.get $0
  i64.const 33
  i64.shr_u
  i64.xor
  i64.const -49064778989728563
  i64.mul
  local.tee $0
  i64.const 33
  i64.shr_u
  local.get $0
  i64.xor
  i64.const -4265267296055464877
  i64.mul
  local.tee $0
  i64.const 33
  i64.shr_u
  local.get $0
  i64.xor
 )
 (func $~lib/math/splitMix32 (param $0 i32) (result i32)
  local.get $0
  i32.const 1831565813
  i32.add
  local.tee $0
  i32.const 1
  i32.or
  local.get $0
  local.get $0
  i32.const 15
  i32.shr_u
  i32.xor
  i32.mul
  local.tee $0
  i32.const 61
  i32.or
  local.get $0
  local.get $0
  i32.const 7
  i32.shr_u
  i32.xor
  i32.mul
  local.get $0
  i32.add
  local.get $0
  i32.xor
  local.tee $0
  i32.const 14
  i32.shr_u
  local.get $0
  i32.xor
 )
 (func $~lib/math/NativeMath.random (result f64)
  (local $0 i64)
  (local $1 i64)
  global.get $~lib/math/random_seeded
  i32.eqz
  if
   call $~lib/builtins/seed
   i64.reinterpret_f64
   local.tee $0
   i64.eqz
   if
    i64.const -7046029254386353131
    local.set $0
   end
   local.get $0
   call $~lib/math/murmurHash3
   global.set $~lib/math/random_state0_64
   global.get $~lib/math/random_state0_64
   i64.const -1
   i64.xor
   call $~lib/math/murmurHash3
   global.set $~lib/math/random_state1_64
   local.get $0
   i32.wrap_i64
   call $~lib/math/splitMix32
   global.set $~lib/math/random_state0_32
   global.get $~lib/math/random_state0_32
   call $~lib/math/splitMix32
   drop
   i32.const 1
   global.set $~lib/math/random_seeded
  end
  global.get $~lib/math/random_state0_64
  local.set $1
  global.get $~lib/math/random_state1_64
  local.tee $0
  global.set $~lib/math/random_state0_64
  local.get $1
  local.get $1
  i64.const 23
  i64.shl
  i64.xor
  local.tee $1
  local.get $1
  i64.const 17
  i64.shr_u
  i64.xor
  local.get $0
  i64.xor
  local.get $0
  i64.const 26
  i64.shr_u
  i64.xor
  global.set $~lib/math/random_state1_64
  local.get $0
  i64.const 12
  i64.shr_u
  i64.const 4607182418800017408
  i64.or
  f64.reinterpret_i64
  f64.const -1
  f64.add
 )
 (func $src/wasm/texture-processor/processNodePositions (param $0 i32) (param $1 i32) (param $2 i32) (param $3 i32) (param $4 f32)
  (local $5 i32)
  (local $6 f32)
  (local $7 f32)
  (local $8 f32)
  (local $9 i32)
  (local $10 i32)
  (local $11 f32)
  local.get $2
  local.get $2
  i32.mul
  local.set $9
  loop $for-loop|0
   local.get $5
   local.get $9
   i32.lt_s
   if
    local.get $5
    i32.const 4
    i32.shl
    local.tee $10
    local.get $3
    i32.add
    local.set $2
    local.get $1
    local.get $5
    i32.gt_s
    if
     local.get $0
     local.get $10
     i32.add
     local.tee $10
     f32.load
     local.set $8
     local.get $10
     f32.load offset=4
     local.set $11
     local.get $10
     f32.load offset=8
     local.set $6
     local.get $10
     f32.load offset=12
     local.set $7
     local.get $2
     local.get $8
     local.get $8
     f32.sub
     f32.const 0
     f32.ne
     if (result f32)
      call $~lib/math/NativeMath.random
      f64.const 2
      f64.mul
      f64.const -1
      f64.add
      f32.demote_f64
     else
      local.get $8
     end
     f32.store
     local.get $2
     local.get $11
     local.get $11
     f32.sub
     f32.const 0
     f32.ne
     if (result f32)
      call $~lib/math/NativeMath.random
      f64.const 2
      f64.mul
      f64.const -1
      f64.add
      f32.demote_f64
     else
      local.get $11
     end
     f32.store offset=4
     local.get $2
     local.get $6
     local.get $6
     f32.sub
     f32.const 0
     f32.ne
     if (result f32)
      call $~lib/math/NativeMath.random
      f64.const 2
      f64.mul
      f64.const -1
      f64.add
      f32.demote_f64
     else
      local.get $6
     end
     f32.store offset=8
     local.get $2
     local.get $7
     f32.store offset=12
    else
     local.get $2
     local.get $4
     f32.const 10
     f32.mul
     local.tee $6
     f32.store
     local.get $2
     local.get $6
     f32.store offset=4
     local.get $2
     local.get $6
     f32.store offset=8
     local.get $2
     f32.const 0
     f32.store offset=12
    end
    local.get $5
    i32.const 1
    i32.add
    local.set $5
    br $for-loop|0
   end
  end
 )
 (func $src/wasm/texture-processor/processLinks (param $0 i32) (param $1 i32) (param $2 i32) (param $3 i32)
  (local $4 i32)
  (local $5 i32)
  (local $6 f32)
  (local $7 i32)
  (local $8 i32)
  (local $9 f32)
  (local $10 f32)
  (local $11 f32)
  (local $12 i32)
  local.get $2
  local.get $2
  i32.mul
  local.set $7
  local.get $2
  f32.convert_i32_s
  local.set $6
  loop $for-loop|0
   local.get $5
   local.get $7
   i32.lt_s
   if
    local.get $3
    local.get $5
    i32.const 4
    i32.shl
    i32.add
    local.set $4
    local.get $1
    local.get $5
    i32.gt_s
    if
     local.get $0
     local.get $5
     i32.const 3
     i32.shl
     i32.add
     local.tee $12
     i32.load
     local.tee $8
     local.get $2
     i32.div_s
     f32.convert_i32_s
     local.get $6
     f32.div
     local.set $9
     local.get $12
     i32.load offset=4
     local.tee $12
     local.get $2
     i32.rem_s
     f32.convert_i32_s
     local.get $6
     f32.div
     local.set $10
     local.get $12
     local.get $2
     i32.div_s
     f32.convert_i32_s
     local.get $6
     f32.div
     local.set $11
     local.get $4
     local.get $8
     local.get $2
     i32.rem_s
     f32.convert_i32_s
     local.get $6
     f32.div
     f32.store
     local.get $4
     local.get $9
     f32.store offset=4
     local.get $4
     local.get $10
     f32.store offset=8
     local.get $4
     local.get $11
     f32.store offset=12
    else
     local.get $4
     f32.const 0
     f32.store
     local.get $4
     f32.const 0
     f32.store offset=4
     local.get $4
     f32.const 0
     f32.store offset=8
     local.get $4
     f32.const 0
     f32.store offset=12
    end
    local.get $5
    i32.const 1
    i32.add
    local.set $5
    br $for-loop|0
   end
  end
 )
 (func $src/wasm/texture-processor/processTextures (param $0 i32) (param $1 i32) (param $2 i32) (param $3 i32) (param $4 i32) (param $5 i32) (param $6 i32) (param $7 f32)
  local.get $0
  local.get $1
  local.get $4
  local.get $5
  local.get $7
  call $src/wasm/texture-processor/processNodePositions
  local.get $2
  local.get $3
  local.get $4
  local.get $6
  call $src/wasm/texture-processor/processLinks
 )
 (func $src/wasm/texture-processor/allocateMemory (param $0 i32) (result i32)
  (local $1 i32)
  (local $2 i32)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  local.get $0
  i32.const 1073741820
  i32.gt_u
  if
   i32.const 1056
   i32.const 1120
   i32.const 33
   i32.const 29
   call $~lib/builtins/abort
   unreachable
  end
  global.get $~lib/rt/stub/offset
  local.set $1
  global.get $~lib/rt/stub/offset
  i32.const 4
  i32.add
  local.tee $2
  local.get $0
  i32.const 19
  i32.add
  i32.const -16
  i32.and
  i32.const 4
  i32.sub
  local.tee $0
  i32.add
  local.tee $3
  memory.size
  local.tee $4
  i32.const 16
  i32.shl
  i32.const 15
  i32.add
  i32.const -16
  i32.and
  local.tee $5
  i32.gt_u
  if
   local.get $4
   local.get $3
   local.get $5
   i32.sub
   i32.const 65535
   i32.add
   i32.const -65536
   i32.and
   i32.const 16
   i32.shr_u
   local.tee $5
   local.get $4
   local.get $5
   i32.gt_s
   select
   memory.grow
   i32.const 0
   i32.lt_s
   if
    local.get $5
    memory.grow
    i32.const 0
    i32.lt_s
    if
     unreachable
    end
   end
  end
  local.get $3
  global.set $~lib/rt/stub/offset
  local.get $1
  local.get $0
  i32.store
  local.get $2
 )
 (func $src/wasm/texture-processor/freeMemory (param $0 i32)
  local.get $0
  i32.const 15
  i32.and
  i32.const 1
  local.get $0
  select
  if
   i32.const 0
   i32.const 1120
   i32.const 70
   i32.const 3
   call $~lib/builtins/abort
   unreachable
  end
  global.get $~lib/rt/stub/offset
  local.get $0
  local.get $0
  i32.const 4
  i32.sub
  local.tee $0
  i32.load
  i32.add
  i32.eq
  if
   local.get $0
   global.set $~lib/rt/stub/offset
  end
 )
 (func $src/wasm/texture-processor/getMemoryUsage (result i32)
  memory.size
  i32.const 16
  i32.shl
 )
 (func $~start
  i32.const 1164
  global.set $~lib/rt/stub/offset
 )
)
