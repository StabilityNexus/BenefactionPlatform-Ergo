<div class="skeleton-card">
	<div class="skeleton-header"></div>
	<div class="skeleton-content">
		<div class="skeleton-line"></div>
		<div class="skeleton-line w-5/6"></div>
	</div>
	<div class="skeleton-footer">
		<div class="skeleton-progress"></div>
		<div class="skeleton-button"></div>
	</div>
</div>

<style>
	.skeleton-card {
		background-color: rgba(42, 42, 42, 0.5);
		border: 1px solid rgba(255, 165, 0, 0.1);
		border-radius: 0.5rem;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		overflow: hidden;
		position: relative;
		min-height: 400px;
        backdrop-filter: blur(4px);
	}

	.skeleton-header {
		height: 1.75rem;
		width: 60%;
		background-color: rgba(60, 60, 60, 0.7);
		border-radius: 0.375rem;
	}

	.skeleton-content {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		flex-grow: 1;
	}

	.skeleton-line {
		height: 1rem;
		background-color: rgba(60, 60, 60, 0.7);
		border-radius: 0.25rem;
	}

	.skeleton-footer {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
        margin-top: auto;
	}

	.skeleton-progress {
		height: 0.75rem;
		background-color: rgba(60, 60, 60, 0.7);
		border-radius: 999px;
		width: 100%;
	}

	.skeleton-button {
		height: 2.5rem;
		background-color: rgba(60, 60, 60, 0.7);
		border-radius: 0.375rem;
	}

	.skeleton-card::after {
		content: '';
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		left: 0;
		transform: translateX(-100%);
		background-image: linear-gradient(
			90deg,
			rgba(255, 255, 255, 0) 0,
			rgba(255, 255, 255, 0.04) 20%,
			rgba(255, 255, 255, 0.08) 60%,
			rgba(255, 255, 255, 0)
		);
		animation: shimmer 2.5s infinite;
	}

	@keyframes shimmer {
		100% {
			transform: translateX(100%);
		}
	}
</style>