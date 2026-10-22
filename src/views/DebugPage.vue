<script setup lang="ts">
import { nextTick, ref } from 'vue'
import DiffTool from '../components/debug/DiffTool.vue'
import HashTool from '../components/debug/HashTool.vue'
import RegexTool from '../components/debug/RegexTool.vue'

const tools = [
  { id: 'diff', label: '文本 / JSON 对比', component: DiffTool },
  { id: 'hash', label: '哈希与文件校验', component: HashTool },
  { id: 'regex', label: '正则调试', component: RegexTool },
] as const
const active = ref(0)

async function navigate(event: KeyboardEvent) {
  const index = { ArrowRight: (active.value + 1) % tools.length, ArrowLeft: (active.value + tools.length - 1) % tools.length, Home: 0, End: tools.length - 1 }[event.key]
  if (index === undefined) return
  event.preventDefault()
  active.value = index
  await nextTick()
  document.getElementById(`debug-tab-${tools[index]!.id}`)?.focus()
}
</script>

<template>
  <main class="encoding-page debug-page">
    <header class="encoding-header"><div><h1>开发辅助</h1><p>比较文本与 JSON、校验文件摘要、调试正则匹配与替换</p></div><span class="encoding-local"><i></i>本地处理 · 不上传文本或文件</span></header>
    <nav class="debug-tabs" role="tablist" aria-label="开发辅助工具" @keydown="navigate">
      <button v-for="(tool, index) in tools" :id="`debug-tab-${tool.id}`" :key="tool.id" type="button" role="tab"
        :aria-selected="active === index" :aria-controls="`debug-panel-${tool.id}`" :tabindex="active === index ? 0 : -1"
        :class="{ active: active === index }" @click="active = index">{{ tool.label }}</button>
    </nav>
    <KeepAlive>
      <component :is="tools[active]!.component" :id="`debug-panel-${tools[active]!.id}`" role="tabpanel" :aria-labelledby="`debug-tab-${tools[active]!.id}`" />
    </KeepAlive>
    <footer class="encoding-page-footer">KIKYO TOOLS <span>差异对比 · 分块哈希 · JavaScript 正则</span></footer>
  </main>
</template>
