<script lang="ts">
  import { Line } from "svelte-chartjs";
  import {
    Chart as ChartJS,
    Title,
    Tooltip,
    Legend,
    LineElement,
    LinearScale,
    PointElement,
    CategoryScale,
    TimeScale,
  } from "chart.js";
  import annotationPlugin from "chartjs-plugin-annotation";
  import type { TimeSeriesData } from "$lib/ergo/analytics";

  ChartJS.register(
    Title,
    Tooltip,
    Legend,
    LineElement,
    LinearScale,
    PointElement,
    CategoryScale,
    TimeScale,
    annotationPlugin,
  );

  export let data: TimeSeriesData[] = [];
  export let minGoal: number = 0;
  export let maxGoal: number = 0;

  // Format data for Chart.js
  $: chartData = {
    labels: data.map((d) => new Date(d.timestamp).toLocaleDateString()),
    datasets: [
      {
        label: "Funds Raised",
        fill: true,
        lineTension: 0.3,
        backgroundColor: "rgba(75,192,192,0.4)",
        borderColor: "rgba(75,192,192,1)",
        borderCapStyle: "butt",
        borderDash: [],
        borderDashOffset: 0.0,
        borderJoinStyle: "miter",
        pointBorderColor: "rgba(75,192,192,1)",
        pointBackgroundColor: "#fff",
        pointBorderWidth: 1,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: "rgba(75,192,192,1)",
        pointHoverBorderColor: "rgba(220,220,220,1)",
        pointHoverBorderWidth: 2,
        pointRadius: 1,
        pointHitRadius: 10,
        data: data.map((d) => d.value),
      },
    ],
  };

  $: options = {
    responsive: true,
    plugins: {
      annotation: {
        annotations: {
          minGoal: {
            type: "line",
            yMin: minGoal,
            yMax: minGoal,
            borderColor: "rgb(255, 99, 132)",
            borderWidth: 2,
            label: {
              content: "Min Goal",
              enabled: true,
            },
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };
</script>

<div
  class="chart-container p-4 bg-card rounded-xl shadow-sm border border-border"
>
  <h3 class="text-lg font-semibold mb-4">Funding Progress</h3>
  {#if data.length > 0}
    <Line data={chartData} {options} />
  {:else}
    <div class="text-center py-10 text-muted-foreground">
      No historical data available.
    </div>
  {/if}
</div>
