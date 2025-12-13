# Analytics Quick Start Guide

## Getting Started in 3 Steps

### Step 1: Access the Analytics Dashboard

Navigate to the analytics page in your browser:
```
http://localhost:5173/analytics
```

The dashboard will automatically load and display:
- Platform overview with key metrics
- Project performance tracking
- Contributor analysis
- Trend visualizations
- Export options

### Step 2: Explore the Tabs

**Overview Tab**: See platform-wide statistics
- Total projects (active, completed, failed)
- Total funds raised
- Contributor counts
- Success rates

**Projects Tab**: View individual project performance
- Funding progress bars
- Contribution statistics
- Time remaining
- Success likelihood

**Contributors Tab**: Analyze contributor behavior
- Active vs. total contributors
- Average contribution sizes
- Refund rates
- Engagement metrics

**Trends Tab**: Examine time-series data
- Select a project to view trends
- Funding growth over time
- Contributor acquisition

**Export Tab**: Download reports
- Choose format (CSV, JSON, HTML)
- Download platform or project reports
- Share with stakeholders

### Step 3: Export Reports

1. Click the "Export" tab
2. Select your preferred format:
   - **CSV**: Open in Excel/Google Sheets
   - **JSON**: Use programmatically
   - **HTML**: View in browser or print
3. Click "Download Report"

## Adding Analytics to Your Pages

### Simple Widget Integration

```svelte
<script lang="ts">
    import { PlatformOverview } from '$lib/components/analytics';
    import { getPlatformMetrics } from '$lib/analytics';
    import { projects } from '$lib/common/store';
    
    let currentHeight = 0;
    
    // Fetch current height
    onMount(async () => {
        if ($projects.data.size > 0) {
            const firstProject = Array.from($projects.data.values())[0];
            currentHeight = await firstProject.platform.get_current_height();
        }
    });
    
    $: allProjects = Array.from($projects.data.values());
    $: platformMetrics = allProjects.length > 0 
        ? getPlatformMetrics(allProjects, currentHeight) 
        : null;
</script>

{#if platformMetrics}
    <PlatformOverview metrics={platformMetrics} />
{/if}
```

### Show Top Projects

```svelte
<script lang="ts">
    import { FundingProgress } from '$lib/components/analytics';
    import { calculateProjectMetrics } from '$lib/analytics';
    
    // Get top 3 projects by funding progress
    $: topProjects = allProjects
        .map(p => ({
            project: p,
            metrics: calculateProjectMetrics(p, currentHeight)
        }))
        .sort((a, b) => b.metrics.funding_progress - a.metrics.funding_progress)
        .slice(0, 3);
</script>

<div class="top-projects">
    <h2>Top Performing Projects</h2>
    {#each topProjects as { metrics }}
        <FundingProgress {metrics} />
    {/each}
</div>
```

## Common Tasks

### Calculate Project Metrics
```typescript
import { calculateProjectMetrics } from '$lib/analytics';

const metrics = calculateProjectMetrics(project, currentBlockHeight);
console.log(metrics.funding_progress); // e.g., 75.5
console.log(metrics.contributor_count); // e.g., 42
```

### Generate Time Series
```typescript
import { generateFundingTimeSeries } from '$lib/analytics';

const timeSeries = generateFundingTimeSeries(project, 10);
// Returns 10 data points showing funding over time
```

### Export a Report
```typescript
import { generateProjectReport, exportReport } from '$lib/analytics';

const report = generateProjectReport(project, currentHeight);
exportReport(report, 'html', 'project-report');
// Downloads: project-report-2025-12-13.html
```

## Tips & Tricks

### 1. Auto-Refresh Data
The analytics dashboard automatically refreshes every minute. To change this:
```typescript
const interval = setInterval(async () => {
    // Update logic
}, 30000); // 30 seconds instead of 60
```

### 2. Custom Colors
Change chart colors by modifying the `color` prop:
```svelte
<Chart data={myData} color="#10b981" type="line" />
```

### 3. Cache Management
Analytics data is cached for 5 minutes. Force refresh:
```typescript
import { updateAnalyticsCache } from '$lib/analytics';

updateAnalyticsCache(projects, currentHeight);
```

### 4. Dark Mode
All components support dark mode automatically via Tailwind's dark mode classes.

## Troubleshooting

### No Data Showing
- Ensure projects are loaded: `console.log($projects.data.size)`
- Check block height is set: `console.log(currentHeight)`
- Verify project data structure matches expected interface

### Charts Not Rendering
- Check data array has values: `console.log(data.length)`
- Ensure chart has positive height: `height={300}`
- Verify SVG container has space

### Export Not Working
- Check browser console for errors
- Ensure popup blocker is disabled
- Try different export format

## API Reference

### Key Functions

**calculateProjectMetrics(project, height)**
- Returns: `ProjectMetrics`
- Calculates all metrics for a single project

**calculatePlatformMetrics(projects, height)**
- Returns: `PlatformMetrics`
- Aggregates metrics across all projects

**calculateContributorMetrics(projects)**
- Returns: `ContributorMetrics`
- Analyzes contributor behavior

**exportReport(data, format, basename)**
- Exports and downloads a report
- Formats: 'csv' | 'json' | 'html'

### Key Components

**`<FundingProgress metrics={...} />`**
- Shows detailed project funding status

**`<ContributorDashboard metrics={...} />`**
- Displays contributor analytics

**`<TimeSeriesAnalytics project={...} />`**
- Charts trends over time

**`<ExportReports projects={...} currentHeight={...} />`**
- UI for exporting reports

**`<PlatformOverview metrics={...} />`**
- Compact platform summary

## Further Reading

- **ANALYTICS_README.md**: Complete documentation
- **INTEGRATION_EXAMPLE.md**: Integration examples
- **IMPLEMENTATION_SUMMARY.md**: Technical details

## Need Help?

Common issues and solutions:
1. **Module not found**: Run `npm install`
2. **Type errors**: Ensure TypeScript is configured correctly
3. **Styling issues**: Check Tailwind CSS is working
4. **Data not updating**: Verify stores are reactive with `$` prefix

Happy analyzing! 📊
