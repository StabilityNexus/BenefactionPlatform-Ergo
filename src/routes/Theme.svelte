<script lang="ts">
    import Sun from "lucide-svelte/icons/sun";
    import Moon from "lucide-svelte/icons/moon";
    import { resetMode, setMode } from "mode-watcher";
    import { get } from "svelte/store";

    let currentMode: "light" | "dark" = get(resetMode()) ? "system" : "light";

    function toggleTheme() {
        if (currentMode === "light") {
            setMode("dark");
            currentMode = "dark";
        } else {
            setMode("light");
            currentMode = "light";
        }
    }
</script>

<button
    class="relative p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
    on:click={toggleTheme}
    aria-label="Toggle theme"
>
    <Sun
        class="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
    />
    <Moon
        class="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
    />
</button>
