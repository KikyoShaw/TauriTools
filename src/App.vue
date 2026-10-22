<script setup lang="ts">
import { nextTick, ref } from 'vue'
import CalculatorPage from './views/CalculatorPage.vue'
import EncodingPage from './views/EncodingPage.vue'
import ColorPage from './views/ColorPage.vue'
import JsonPage from './views/JsonPage.vue'
import QrPage from './views/QrPage.vue'

const tabs = [
  { id: 'calculator', label: '计算器', component: CalculatorPage },
  { id: 'encoding', label: '编码工具', component: EncodingPage },
  { id: 'color', label: '颜色转换', component: ColorPage },
  { id: 'json', label: 'JSON 工具', component: JsonPage },
  { id: 'qrcode', label: '二维码', component: QrPage },
] as const
const active = ref(0)

async function navigate(event: KeyboardEvent) {
  const destinations: Record<string, number> = {
    ArrowRight: (active.value + 1) % tabs.length,
    ArrowLeft: (active.value + tabs.length - 1) % tabs.length,
    Home: 0,
    End: tabs.length - 1,
  }
  const index = destinations[event.key]
  if (index === undefined) return
  event.preventDefault()
  active.value = index
  await nextTick()
  document.getElementById(`app-tab-${tabs[index]!.id}`)?.focus()
}
</script>

<template>
  <div class="application">
    <header class="application-nav">
      <div class="suite-brand">KIKYO <span>TOOLS</span></div>
      <nav class="primary-tabs" role="tablist" aria-label="工具页面" @keydown="navigate">
        <button v-for="(tab, index) in tabs" :id="`app-tab-${tab.id}`" :key="tab.id" type="button"
          role="tab" :aria-selected="active === index" :aria-controls="`app-panel-${tab.id}`"
          :tabindex="active === index ? 0 : -1" :class="{ active: active === index }"
          @click="active = index">{{ tab.label }}</button>
      </nav>
      <span class="suite-caption">开发者的本地工具箱</span>
    </header>
    <KeepAlive>
      <component :is="tabs[active]!.component" :id="`app-panel-${tabs[active]!.id}`" role="tabpanel"
        :aria-labelledby="`app-tab-${tabs[active]!.id}`" />
    </KeepAlive>
  </div>
</template>
