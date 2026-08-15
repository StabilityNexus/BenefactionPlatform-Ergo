<script lang="ts">
    import { badgeVariants } from "$lib/components/ui/badge";
    import { is_legacy_version, type Project } from "$lib/common/project";

    export let project: Project;
    /** Compact form for cards, where the row is already crowded. */
    export let compact: boolean = false;

    $: isLegacy = is_legacy_version(project);
    $: label = project.version.replace("_", ".");

    const explanation =
        "This campaign runs on an older version of the contract. Check the project's " +
        "own channels before contributing, and prefer campaigns on the current contract.";
</script>

{#if isLegacy}
    <a
        href="https://github.com/StabilityNexus/BenefactionPlatform-Ergo/blob/main/contracts/bene_contract/contract_{project.version}.es"
        target="_blank"
        rel="noopener noreferrer"
        title={explanation}
        class="{badgeVariants({
            variant: 'outline',
        })} legacy-badge"
    >
        {compact ? `Legacy ${label}` : `Legacy contract ${label}`}
    </a>
{/if}

<style>
    .legacy-badge {
        border-color: rgba(234, 179, 8, 0.6);
        color: rgb(202, 138, 4);
        background-color: rgba(234, 179, 8, 0.1);
        white-space: nowrap;
    }

    :global(.dark) .legacy-badge {
        color: rgb(250, 204, 21);
    }
</style>
