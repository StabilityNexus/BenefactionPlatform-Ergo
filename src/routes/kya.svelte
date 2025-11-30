<script lang="ts">
  import { onMount } from 'svelte';
  import { createEventDispatcher } from 'svelte';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';

  export let title: string = 'Know Your Assumptions';
  export let closeBtnText: string = 'I understand and I agree';

  let showModal = false;
  let isButtonEnabled = false;
  let contentDiv: HTMLDivElement;

  const dispatch = createEventDispatcher<Record<string, any>>();

  onMount(() => {
    showModal = localStorage.getItem('acceptedKYA') !== 'true';
  });

  function checkScroll(e: Event) {
    const element = e.target as HTMLDivElement;
    if (Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop) < 2) {
      isButtonEnabled = true;
    }
  }

  function close() {
    showModal = false;
    localStorage.setItem('acceptedKYA', 'true');
    dispatch('close');
  }

  $: if (!showModal) {
    dispatch('close');
  }
</script>

<!-- Trigger to open dialog -->
<span
  class="text-gray-500 cursor-pointer"
  on:click={() => (showModal = true)}
  on:keydown={(e) => e.key === 'Enter' && (showModal = true)}
  role="button"
  tabindex="0"
>
  KYA
</span>

<Dialog.Root bind:open={showModal}>
  <Dialog.Content class="w-[800px] max-w-[90vw]">
    <Dialog.Header>
      <Dialog.Title>{title}</Dialog.Title>
    </Dialog.Header>

    <div bind:this={contentDiv} on:scroll={checkScroll} class="max-h-[400px] overflow-y-auto pr-4">
      <p>
        This website is an open-source UI for interacting with the Ergo blockchain. It directly
        interfaces with smart contracts on the Ergo blockchain, enabling campaign owners to raise
        funds for their initiatives and allowing users to contribute to these campaigns.
      </p>

      <p class="font-bold mt-4">Please note:</p>
      <ul class="list-disc ml-6 space-y-2">
        <li>
          In the case of a successful campaign, meaning the minimum funding threshold has been met,
          there is no guarantee that the campaign owners will fulfill their stated goals. This
          website is solely a tool to connect campaigns with contributors.
        </li>
        <li>
          A contribution can only be refunded if both of the following conditions are met:
          <ul class="list-disc ml-6 mt-2">
            <li>The set deadline has passed.</li>
            <li>The fundraising target has not been reached.</li>
          </ul>
        </li>
        <li>
          Campaign funds can only be withdrawn by the campaign owners if the following condition is
          met:
          <ul class="list-disc ml-6 mt-2">
            <li>The fundraising target has been reached.</li>
          </ul>
        </li>
        <li>
          A 5% developer fee is applied to all successfully funded campaigns. This fee is sent to a
          designated developer address when the campaign owner withdraws the funds.
        </li>
      </ul>

      <p class="font-bold mt-4">Additionally:</p>
      <ul class="list-disc ml-6 space-y-2">
        <li>
          Each campaign operates with two tokens: "APT" (Auxiliary Project Token) and "PFT"
          (Proof-Funding Token). APT allows users to request refunds if applicable. When the
          deadline has passed and the minimum funding goal has been reached, users can exchange APT
          for PFT. This design accommodates cases where PFT may be used across multiple campaigns or
          held in reserves by campaign creators.
        </li>
        <li>This website does not log, collect, profile, share, or sell your data.</li>
        <li>
          Bene operates on a blockchain. Therefore, transactions are final and irreversible once
          they achieve "confirmed" status.
        </li>
        <li>All transactions are viewable through Ergo's Explorers.</li>
      </ul>

      <p class="mt-4">There is no guarantee against bugs or errors.</p>
      <p>
        No assistance can be provided if a user is hacked or loses access to their passwords,
        recovery phrases, private keys, or assets.
      </p>

      <p class="font-bold mt-4">By using this website, you agree that:</p>
      <ul class="list-disc ml-6 space-y-2">
        <li>You will use it at your own risk.</li>
        <li>You are solely responsible for your assets.</li>
        <li>
          You are solely responsible for securely storing your passwords, recovery phrases, and
          private keys.
        </li>
      </ul>

      <p class="italic mt-4">Do you understand and agree to these terms?</p>
    </div>

    <Dialog.Footer class="mt-4">
      <Button on:click={close} disabled={!isButtonEnabled}>
        {closeBtnText}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
