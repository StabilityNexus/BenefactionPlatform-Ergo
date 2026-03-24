// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface Platform {}
	}
}

// Environment variables - see .env.example for documentation
declare module '$env/static/public' {
	export const PUBLIC_ORIGIN: string;
}

export {};
