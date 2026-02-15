<script lang="ts">
    import { onMount } from "svelte";
    import Sun from "lucide-svelte/icons/sun";
    import Moon from "lucide-svelte/icons/moon";
    import Monitor from "lucide-svelte/icons/monitor";

    import { resetMode, setMode } from "mode-watcher";

    type ThemeOption = "light" | "dark" | "system";

    const options: { value: ThemeOption; label: string; icon: typeof Sun }[] = [
        { value: "light", label: "Light", icon: Sun },
        { value: "dark", label: "Dark", icon: Moon },
        { value: "system", label: "System", icon: Monitor },
    ];

    let preference: ThemeOption = "system";

    onMount(() => {
        if (typeof localStorage === "undefined") return;

        const stored = localStorage.getItem("mode-watcher");
        preference = stored === "light" || stored === "dark" ? stored : "system";
    });

    function selectTheme(next: ThemeOption) {
        preference = next;

        if (next === "system") {
            resetMode();
            return;
        }

        setMode(next);
    }
</script>

<div class="theme-toggle" role="group" aria-label="Theme selector">
    {#each options as option}
        <button
            class={`theme-button ${preference === option.value ? "active" : ""}`}
            type="button"
            on:click={() => selectTheme(option.value)}
            aria-pressed={preference === option.value}
            title={`${option.label} theme`}
        >
            <svelte:component this={option.icon} class="icon" />
            <span class="label">{option.label}</span>
        </button>
    {/each}
</div>

<style>
    .theme-toggle {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.25rem;
        border-radius: 9999px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
    }

    .theme-button {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.35rem 0.65rem;
        border-radius: 9999px;
        border: 1px solid transparent;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font-size: 0.85rem;
        transition: all 0.18s ease;
    }

    .theme-button .icon {
        width: 1rem;
        height: 1rem;
    }

    .theme-button:hover {
        background: rgba(255, 165, 0, 0.12);
        color: orange;
    }

    .theme-button.active {
        background: rgba(255, 165, 0, 0.18);
        border-color: rgba(255, 165, 0, 0.35);
        color: orange;
        box-shadow: 0 0 0.5rem rgba(255, 165, 0, 0.25);
    }

    .label {
        line-height: 1;
    }

    @media (max-width: 1024px) {
        .label {
            display: none;
        }

        .theme-button {
            padding: 0.35rem;
        }
    }
</style>
