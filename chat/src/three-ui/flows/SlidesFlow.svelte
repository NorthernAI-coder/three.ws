<script>
  import { composerFill } from '../../stores.js';
  import Icon from '../../Icon.svelte';
  import { feArrowUpLeft, feLayout, feChevronDown, feUpload } from '../../feather.js';

  const samplePrompts = [
    'Automate weekly team status reporting',
    'Build quarterly sales performance dashboard',
    'Create strategic business review presentation',
    'Design investor pitch deck with projections',
  ];

  const templateCount = 8;

  const slideCountOptions = ['4 - 8', '8 - 12', '12 - 16', '16 - 20'];
  let selectedSlideCount = '8 - 12';
  let slideCountOpen = false;

  function selectPrompt(prompt) {
    composerFill.set({ text: prompt, submit: true, ifEmpty: false });
  }
</script>

<div class="w-full max-w-[760px] mx-auto">
  <h2 class="text-sm font-semibold text-ink mb-3 mt-10">Sample prompts</h2>
  <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
    {#each samplePrompts as prompt}
      <button
        class="bg-white border border-rule rounded-xl p-4 text-left h-[112px] flex flex-col justify-between hover:bg-paper transition-colors"
        on:click={() => selectPrompt(prompt)}
      >
        <span class="text-sm text-ink line-clamp-2">{prompt}</span>
        <Icon icon={feArrowUpLeft} class="w-[14px] h-[14px] text-ink-faint self-end shrink-0" />
      </button>
    {/each}
  </div>

  <div class="flex items-center justify-between mb-3 mt-10">
    <h2 class="text-sm font-semibold text-ink">Choose a template</h2>
    <div class="relative">
      <button
        class="bg-white border border-rule rounded-full h-9 px-3 text-sm flex items-center gap-2 hover:bg-paper transition-colors"
        on:click={() => (slideCountOpen = !slideCountOpen)}
      >
        <Icon icon={feLayout} class="w-4 h-4 text-ink-soft" />
        {selectedSlideCount}
        <Icon icon={feChevronDown} class="w-3 h-3 text-ink-soft" />
      </button>
      {#if slideCountOpen}
        <div class="absolute right-0 top-full mt-1 bg-white border border-rule rounded-xl shadow-pop z-10 min-w-[120px]">
          {#each slideCountOptions as option}
            <button
              class="block w-full px-4 py-2 text-sm text-left text-ink hover:bg-paper first:rounded-t-xl last:rounded-b-xl"
              on:click={() => { selectedSlideCount = option; slideCountOpen = false; }}
            >
              {option}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <div class="grid grid-cols-4 gap-4 pb-8">
    <button class="aspect-[4/3] bg-white border border-rule rounded-xl flex flex-col items-center justify-center gap-2 hover:bg-paper transition-colors">
      <Icon icon={feUpload} class="w-5 h-5 text-ink-soft" />
      <span class="text-xs text-ink-soft">Import template</span>
    </button>
    {#each Array(templateCount) as _, i}
      <button class="aspect-[4/3] bg-paper-deep rounded-xl flex items-center justify-center hover:opacity-80 transition-opacity">
        <span class="text-xs text-ink-soft font-serif text-center px-2">Sample template {i + 1}</span>
      </button>
    {/each}
  </div>
</div>
