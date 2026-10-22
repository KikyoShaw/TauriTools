<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { JsonNode } from '../utils/json'

const props = defineProps<{ root: JsonNode }>()
interface TreeRow { node: JsonNode; label: string; path: string; depth: number }
const expanded = ref(new Set<number>())
const limit = ref(1000)
watch(() => props.root, root => {
  expanded.value = new Set([root.start])
  limit.value = 1000
}, { immediate: true })

function isContainer(node: JsonNode) { return node.type === 'object' || node.type === 'array' }
function size(node: JsonNode) { return node.entries?.length ?? node.items?.length ?? 0 }
function toggle(node: JsonNode) {
  const next = new Set(expanded.value)
  if (next.has(node.start)) next.delete(node.start)
  else next.add(node.start)
  expanded.value = next
}
function expandAll() {
  const next = new Set<number>()
  const stack = [props.root]
  while (stack.length) {
    const node = stack.pop()!
    if (isContainer(node)) next.add(node.start)
    for (const entry of node.entries ?? []) stack.push(entry.value)
    for (const item of node.items ?? []) stack.push(item)
  }
  expanded.value = next
}
const visible = computed(() => {
  const rows: TreeRow[] = []
  const stack: TreeRow[] = [{ node: props.root, label: '$', path: '$', depth: 0 }]
  while (stack.length && rows.length < limit.value) {
    const row = stack.pop()!
    rows.push(row)
    if (!expanded.value.has(row.node.start)) continue
    if (row.node.entries) {
      for (let index = row.node.entries.length - 1; index >= 0; index--) {
        const entry = row.node.entries[index]!
        const label = JSON.stringify(entry.key)
        stack.push({ node: entry.value, label, path: `${row.path}[${label}]`, depth: row.depth + 1 })
      }
    } else if (row.node.items) {
      for (let index = row.node.items.length - 1; index >= 0; index--) {
        stack.push({ node: row.node.items[index]!, label: `[${index}]`, path: `${row.path}[${index}]`, depth: row.depth + 1 })
      }
    }
  }
  return { rows, more: stack.length > 0 }
})
</script>

<template>
  <div class="json-tree-panel">
    <div class="json-tree-toolbar"><span>点击箭头展开对象或数组</span><div><button type="button" class="text-button" @click="expandAll">全部展开</button><button type="button" class="text-button" @click="expanded = new Set()">全部折叠</button></div></div>
    <div class="json-tree" aria-label="JSON 树形解析">
      <div v-for="row in visible.rows" :key="row.node.start" class="json-tree-row" :style="{ paddingLeft: `${12 + row.depth * 18}px` }" :title="row.path" :data-json-path="row.path">
        <button v-if="isContainer(row.node)" class="json-tree-toggle" type="button" :aria-label="`${expanded.has(row.node.start) ? '折叠' : '展开'} ${row.path}`" :aria-expanded="expanded.has(row.node.start)" @click="toggle(row.node)">{{ expanded.has(row.node.start) ? '▾' : '▸' }}</button>
        <span v-else class="json-tree-spacer"></span>
        <span class="json-tree-key">{{ row.label }}<span v-if="row.depth">:</span></span>
        <span v-if="isContainer(row.node)" class="json-tree-container">{{ row.node.type === 'object' ? 'Object' : 'Array' }} <span>{{ row.node.type === 'object' ? '{' : '[' }} {{ size(row.node) }} {{ row.node.type === 'object' ? '}' : ']' }}</span></span>
        <span v-else class="json-tree-value" :class="`json-token-${row.node.type}`">{{ row.node.raw }}</span>
      </div>
      <div v-if="visible.more" class="json-tree-more"><span>已显示 {{ visible.rows.length.toLocaleString() }} 个展开节点</span><button type="button" class="utility-button" @click="limit += 1000">再显示 1000 项</button></div>
    </div>
  </div>
</template>
