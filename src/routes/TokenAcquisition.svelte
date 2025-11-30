<script lang="ts">
  import ProjectList from './ProjectList.svelte';
  import { type Project } from '$lib/common/project';

  async function projectFilter(_project: Project) {
    return true;
  }
</script>

<ProjectList filterProject={projectFilter}>Fundraising Campaigns</ProjectList>
