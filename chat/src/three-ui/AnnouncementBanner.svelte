<script>
  import { persisted } from '../localstorage.js';
  import Icon from '../Icon.svelte';
  import { feArrowRight, feX } from '../feather.js';

  const dismissed = persisted('three.wsBannerDismissed_v1', false);
  export let href = '#';
  export let message = 'three.ws is now part of Meta — bringing AI to businesses worldwide';
</script>

{#if !$dismissed}
  <div class="relative w-full bg-paper-deep text-ink">
    <a {href} class="flex items-center justify-center gap-2 h-10 text-sm font-medium hover:opacity-80">
      <span>{message}</span>
      <Icon icon={feArrowRight} class="h-4 w-4 shrink-0" />
    </a>
    <button
      class="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-ink-soft hover:text-ink"
      on:click={() => ($dismissed = true)}
      aria-label="Dismiss announcement">
      <Icon icon={feX} class="h-4 w-4" />
    </button>
  </div>
{/if}
