<script>
  import { route } from '../../stores.js';
  import Icon from '../../Icon.svelte';
  import { feVideo, feMapPin, feClock, feZap, fePlay } from '../../feather.js';

  const items = [
    { title: 'Webinars',        subtitle: 'Live sessions with the three.ws team',        route: 'events/webinars',     icon: feVideo },
    { title: 'Conferences',     subtitle: 'Where you can find us in person',          route: 'events/conferences',  icon: feMapPin },
    { title: 'Office hours',    subtitle: 'Weekly Q&A with engineers',                route: 'events/office-hours', icon: feClock },
    { title: 'Hackathons',      subtitle: 'Build with three.ws alongside the community', route: 'events/hackathons',   icon: feZap },
    { title: 'Past recordings', subtitle: 'Replay every session on demand',           route: 'events/recordings',   icon: fePlay },
  ];
</script>

<div class="bg-white border border-rule rounded-2xl shadow-pop p-3 w-[420px]">
  {#each items as item}
    <button
      class="flex items-start gap-3 w-full px-3 py-3 rounded-xl text-left hover:bg-paper"
      on:click={() => route.set(item.route)}>
      <span class="w-9 h-9 rounded-lg bg-paper flex items-center justify-center shrink-0">
        <Icon icon={item.icon} class="w-[18px] h-[18px] text-ink" />
      </span>
      <span class="flex-1 min-w-0">
        <span class="block text-sm font-semibold text-ink">{item.title}</span>
        <span class="block text-xs text-ink-soft mt-0.5">{item.subtitle}</span>
      </span>
    </button>
  {/each}
</div>
