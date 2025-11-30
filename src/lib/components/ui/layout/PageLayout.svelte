<script lang="ts">
    export let maxWidth: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full' = 'xl';
    export let padding: 'none' | 'sm' | 'md' | 'lg' = 'md';
    export let centered: boolean = true;

    const maxWidthClasses = {
        sm: 'max-w-screen-sm',
        md: 'max-w-screen-md',
        lg: 'max-w-screen-lg',
        xl: 'max-w-screen-xl',
        '2xl': 'max-w-screen-2xl',
        full: 'max-w-full'
    };

    const paddingClasses = {
        none: '',
        sm: 'px-3 sm:px-4',
        md: 'px-4 sm:px-6 lg:px-8',
        lg: 'px-6 sm:px-8 lg:px-12'
    };
</script>

<div 
    class="page-layout {maxWidthClasses[maxWidth]} {paddingClasses[padding]} {centered ? 'mx-auto' : ''}"
    role="main"
>
    <slot />
</div>

<style>
    .page-layout {
        width: 100%;
        min-height: calc(100vh - 160px);
        padding-top: 1.5rem;
        padding-bottom: 2rem;
    }

    @media (min-width: 640px) {
        .page-layout {
            padding-top: 2rem;
            padding-bottom: 3rem;
        }
    }
</style>
