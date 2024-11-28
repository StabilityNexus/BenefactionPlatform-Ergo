<script lang="ts">
    import { Button } from "spaper";
    import { onMount } from "svelte";
    import { createEventDispatcher, SvelteComponent } from 'svelte';

    let showModal = false;
    let isButtonEnabled = false;
    let contentDiv;

    export let active: boolean = false;
    export let title: string = 'Know Your Assumptions';
    export let subTitle: string = '';
    export let content: string = '';
    export let component: typeof SvelteComponent = null;
    export let closeBtnText: string = 'I understand and I agree';

    const dispatch = createEventDispatcher();

    onMount(() => {
      showModal = localStorage.getItem('acceptedKYA') !== 'true';
    });

    // Function to check if user has scrolled to the bottom of the content
    function checkScroll() {
      if (contentDiv.scrollTop + contentDiv.clientHeight >= contentDiv.scrollHeight) {
        isButtonEnabled = true;
      }
    }

    function close() {
      showModal = false;
      localStorage.setItem('acceptedKYA', 'true');
      dispatch('close');
    }

    function handleKeydown({ key }) {
      if (key === 'Escape') close();
    }

    $: if (!showModal) {
      dispatch('close');
    }
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<span style="color: gray; cursor: pointer;" on:click={() => (showModal = true)}>
  KYA
</span>

{#if showModal}
<div class="modal" class:active={showModal}>
  <div class="modal-body">
    {#if title}
      <h4 class="modal-title">{title}</h4>
    {/if}
    {#if subTitle}
      <h5 class="modal-subtitle">{subTitle}</h5>
    {/if}
    <div bind:this={contentDiv} on:scroll={checkScroll} style="max-height: 400px; overflow-y: auto; padding-right: 1rem;">
      <p>This website is an open-source UI for interacting with the Ergo blockchain. It directly interfaces with smart contracts on the Ergo blockchain, enabling project owners to raise funds for their initiatives and allowing users to contribute to these projects.</p>
      <p><strong>Please note:</strong></p>
      <ul>
        <li>In the case of a successful project, meaning the minimum funding threshold has been met, there is no guarantee that the project owners will fulfill their stated goals. This website is solely a tool to connect projects with contributors.</li>
        <li>A contribution can only be refunded if both of the following conditions are met:
          <ul>
            <li>The set deadline has passed.</li>
            <li>The fundraising target has not been reached.</li>
          </ul>
        </li>
        <li>Project funds can only be withdrawn by the project owners if the following condition is met:
          <ul>
            <li>The fundraising target has been reached.</li>
          </ul>
        </li>
        <li>A 5% developer fee is applied to all successfully funded projects. This fee is sent to a designated developer address when the project owner withdraws the funds.</li>
      </ul>
      <p>Additionally:</p>
      <ul>
        <li>This website does not log, collect, profile, share, or sell your data.</li>
        <li>Bene Fundraising Platform operates on a blockchain. Therefore, transactions are final and irreversible once they achieve "confirmed" status.</li>
        <li>All transactions are viewable through Ergo's Explorers.</li>
      </ul>
      <p>There is no guarantee against bugs or errors.</p>
      <p>No assistance can be provided if a user is hacked or loses access to their passwords, recovery phrases, private keys, or assets.</p>
      <p><strong>By using this website, you agree that:</strong></p>
      <ul>
        <li>You will use it at your own risk.</li>
        <li>You are solely responsible for your assets.</li>
        <li>You are solely responsible for securely storing your passwords, recovery phrases, and private keys.</li>
      </ul>
      <p><em>Do you understand and agree to these terms?</em></p>
    </div>
    <footer>
      <Button on:click={close} disabled={!isButtonEnabled}>
        {closeBtnText}
      </Button>
    </footer>
  </div>
</div>
{/if}

<style>
  .modal.active {
      opacity: 1;
      visibility: visible;
  }

  .modal-body {
      top: 50%;
      max-width: 800;
      width: 40%;
      margin: auto;
      background-color: white;
      padding: 1rem;
      border-radius: 8px;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  }
</style>
