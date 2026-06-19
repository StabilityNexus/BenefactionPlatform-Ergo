<script lang="ts">
  import { onMount } from "svelte";
  import Sun from "lucide-svelte/icons/sun";
  import Moon from "lucide-svelte/icons/moon";

  import { setMode } from "mode-watcher";
  import { Button } from "$lib/components/ui/button/index.js";

  // track current visual state for aria/pressed
  let isDark = false;

  onMount(() => {
    // read initial theme from document (mode-watcher applies 'dark' class)
    isDark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  });

  function toggleTheme() {
    isDark = !isDark;
    setMode(isDark ? "dark" : "light");
  }
</script>

<!-- Accessible single-button toggle -->
<Button
  on:click={toggleTheme}
  variant="outline"
  size="icon"
  aria-pressed={isDark}
  title={isDark ? "Switch to light theme" : "Switch to dark theme"}
  class="relative"
>
  <!-- Sun / Moon icons with same transitions used previously -->
  <Sun
    class="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
    aria-hidden="true"
  />
  <Moon
    class="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
    aria-hidden="true"
  />
  <span class="sr-only">Toggle theme</span>
</Button>