<script lang="ts">
  import { type Project } from "$lib/common/project";
  import { address } from "$lib/common/store";
  import { ErgoAddress } from "@fleet-sdk/core";
  import ProjectList from "./ProjectList.svelte";

  const filter = async (project: Project) => {
    // Only show projects if wallet is connected and matches owner
    if (!$address) return false;
    return project.constants.owner == ErgoAddress.fromBase58($address).ergoTree;
  };
</script>

<ProjectList filterProject={filter}>My Campaigns</ProjectList>
