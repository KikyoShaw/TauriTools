<script setup lang="ts">
defineProps<{ busy: boolean }>()
const emit = defineEmits<{ insert: [value: string]; action: [value: string] }>()

const groups = [
  { name: '数字与十六进制', className: 'numbers', rows: [
    ['A', 'D', '7', '8', '9'], ['B', 'E', '4', '5', '6'],
    ['C', 'F', '1', '2', '3'], ['(', ')', 'h', '0', '='],
  ] },
  { name: '算术与位运算', className: 'operators', rows: [
    ['+', '&', '%'], ['−', '|', '<<'], ['*', '~', '>>'], ['/', '^', ','],
  ] },
  { name: '科学函数', className: 'functions', rows: [
    ['Sin', 'Exp'], ['Cos', 'Log'], ['Tan', 'Abs'], ['Sqrt', 'Pow'],
  ] },
]
const operatorTitles: Record<string, string> = {
  '&': '按位与', '|': '按位或', '^': '按位异或', '~': '按位取反',
  '<<': '左移', '>>': '算术右移', '%': '取余', h: '十六进制后缀，如 FFh',
  '=': '赋值，如 x = 17', Log: '常用对数 log(x)', Pow: '乘方 pow(x, y)',
}
function insert(key: string) {
  emit('insert', /^[A-Z][a-z]+$/.test(key) ? `${key.toLowerCase()}()` : key === '−' ? '-' : key)
}
</script>

<template>
  <section class="keypad" aria-label="计算器键盘">
    <div v-for="group in groups" :key="group.name" class="key-group" :class="group.className" :aria-label="group.name">
      <template v-for="(row, rowIndex) in group.rows" :key="rowIndex">
        <button v-for="key in row" :key="key" class="calc-key" type="button"
          :title="operatorTitles[key] ?? key" :aria-label="operatorTitles[key] ?? key"
          @mousedown.prevent @click="insert(key)">{{ key }}</button>
      </template>
    </div>
    <div class="key-group actions">
      <button class="calc-key action-key" type="button" title="删除光标前的字符" @mousedown.prevent @click="emit('action', 'backspace')">退格</button>
      <button class="calc-key action-key" type="button" title="清空表达式 · Esc" @mousedown.prevent @click="emit('action', 'clear')">清除</button>
      <button class="calc-key action-key" type="button" title="复制十进制结果" @mousedown.prevent @click="emit('action', 'copy')">复制</button>
      <button class="calc-key run-key" type="button" title="执行表达式 · Enter" :disabled="busy" @mousedown.prevent @click="emit('action', 'run')">{{ busy ? '计算中' : '运行' }}</button>
    </div>
  </section>
</template>
