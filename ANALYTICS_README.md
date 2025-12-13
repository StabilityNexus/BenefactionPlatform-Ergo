# Analytics & Reporting Module

Comprehensive analytics and reporting system for the Benefaction Platform, providing insights into funding progress, contributor behavior, and platform performance.

## Features

### 1. **Data Collection & Metrics**
- Real-time project metrics calculation
- Platform-wide performance tracking
- Contributor behavior analysis
- Time-series data generation

### 2. **Visualization Components**
- Interactive charts (line, bar, area)
- Funding progress displays
- Contributor dashboards
- Trend analysis visualizations

### 3. **Analytics Dashboard**
- Multi-tab interface for different views
- Platform overview with key KPIs
- Project-by-project performance tracking
- Contributor insights and engagement metrics
- Time-series trend analysis

### 4. **Export Functionality**
- Multiple export formats (CSV, JSON, HTML)
- Single project reports
- Platform-wide comprehensive reports
- Downloadable, shareable reports

## Module Structure

```
src/lib/analytics/
├── metrics.ts           # Core metrics calculation functions
├── store.ts            # Svelte stores for analytics data
├── export.ts           # Report generation and export utilities
└── index.ts            # Module exports

src/lib/components/analytics/
├── Chart.svelte                  # Base chart component
├── FundingProgress.svelte        # Project funding visualization
├── ContributorDashboard.svelte   # Contributor analytics
├── TimeSeriesAnalytics.svelte    # Trend analysis
├── ExportReports.svelte          # Export UI component
├── PlatformOverview.svelte       # Platform summary widget
└── index.ts                      # Component exports

src/routes/analytics/
└── +page.svelte        # Main analytics page
```

## Usage

### Importing Components

```typescript
import { 
    FundingProgress, 
    ContributorDashboard, 
    TimeSeriesAnalytics,
    ExportReports 
} from '$lib/components/analytics';
```

### Using Metrics Functions

```typescript
import { 
    calculateProjectMetrics, 
    calculatePlatformMetrics,
    generateFundingTimeSeries 
} from '$lib/analytics';

// Calculate metrics for a project
const projectMetrics = calculateProjectMetrics(project, currentBlockHeight);

// Calculate platform-wide metrics
const platformMetrics = calculatePlatformMetrics(projects, currentBlockHeight);

// Generate time-series data
const timeSeries = generateFundingTimeSeries(project, 10);
```

### Exporting Reports

```typescript
import { generatePlatformReport, exportReport } from '$lib/analytics';

// Generate and export a platform report
const reportData = generatePlatformReport(projects, currentBlockHeight);
exportReport(reportData, 'csv', 'my-report');
```

## Components

### Chart Component

Generic chart component supporting line, bar, and area charts.

**Props:**
- `data: TimeSeriesDataPoint[]` - Chart data points
- `title: string` - Chart title
- `height: number` - Chart height in pixels
- `color: string` - Primary color for chart
- `type: "line" | "bar" | "area"` - Chart type
- `showGrid: boolean` - Display grid lines
- `showLabels: boolean` - Display axis labels

**Example:**
```svelte
<Chart 
    data={fundingTimeSeries}
    title="Funding Progress"
    height={300}
    color="#4f46e5"
    type="area"
/>
```

### FundingProgress Component

Displays comprehensive funding progress metrics for a project.

**Props:**
- `metrics: ProjectMetrics` - Project metrics to display

**Features:**
- Progress bar with percentage
- Funding statistics
- Contributor count
- Refund rate
- Time remaining
- Success likelihood indicator

### ContributorDashboard Component

Comprehensive contributor analysis dashboard.

**Props:**
- `metrics: ContributorMetrics` - Contributor metrics

**Features:**
- Total and active contributor counts
- Contribution statistics
- Refund analysis
- Engagement quality metrics
- Retention rate visualization

### TimeSeriesAnalytics Component

Time-series trend analysis for projects.

**Props:**
- `project: Project` - Project to analyze
- `dataPoints: number` - Number of data points (default: 10)

**Features:**
- Funding progress over time
- Contributor growth chart
- Trend indicators
- Key insights section

### ExportReports Component

UI for exporting analytics reports.

**Props:**
- `projects: Project[]` - All projects
- `currentHeight: number` - Current blockchain height
- `selectedProject: Project | null` - Optional single project to export

**Features:**
- Format selection (CSV, JSON, HTML)
- Platform-wide or single project exports
- One-click download functionality

### PlatformOverview Component

Compact platform metrics summary widget.

**Props:**
- `metrics: PlatformMetrics` - Platform metrics

**Features:**
- Total projects count
- Active/completed breakdown
- Total funds raised
- Success rate statistics

## Metrics Types

### ProjectMetrics
```typescript
interface ProjectMetrics {
    project_id: string;
    title: string;
    funding_progress: number;        // Percentage (0-100)
    total_raised: number;
    total_goal: number;
    contributor_count: number;
    average_contribution: number;
    refund_rate: number;             // Percentage
    exchange_activity: number;
    time_remaining: number | null;   // Milliseconds or null
    is_active: boolean;
    success_likelihood: number;      // Percentage (0-100)
}
```

### ContributorMetrics
```typescript
interface ContributorMetrics {
    total_unique_contributors: number;
    total_contributions: number;
    average_contribution_size: number;
    largest_contribution: number;
    smallest_contribution: number;
    refund_count: number;
    active_contributors: number;
}
```

### PlatformMetrics
```typescript
interface PlatformMetrics {
    total_projects: number;
    active_projects: number;
    completed_projects: number;
    failed_projects: number;
    total_raised: number;
    total_contributors: number;
    average_project_success_rate: number;
    average_funding_time: number;    // Milliseconds
}
```

### TimeSeriesDataPoint
```typescript
interface TimeSeriesDataPoint {
    timestamp: number;
    value: number;
    label?: string;
}
```

## Analytics Store

The analytics store manages cached data and provides reactive updates.

```typescript
import { 
    currentBlockHeight, 
    analyticsCache, 
    updateAnalyticsCache 
} from '$lib/analytics/store';

// Update block height
currentBlockHeight.set(1234567);

// Update analytics cache
updateAnalyticsCache(projects, currentHeight);

// Get cached metrics
const platformMetrics = getPlatformMetrics(projects, currentHeight);
```

## Export Formats

### CSV Format
- Comma-separated values
- Compatible with Excel and spreadsheet applications
- Includes all metric tables

### JSON Format
- Structured data format
- Ideal for programmatic access
- Preserves all data types and relationships

### HTML Format
- Formatted, styled report
- Viewable in any web browser
- Includes tables and visual formatting
- Printable and shareable

## Accessing the Analytics Dashboard

Navigate to `/analytics` in your application to access the full analytics dashboard.

The dashboard includes:
- **Overview Tab**: Platform summary and contributor dashboard
- **Projects Tab**: Individual project performance metrics
- **Contributors Tab**: Detailed contributor analysis
- **Trends Tab**: Time-series analytics for selected projects
- **Export Tab**: Report generation and download

## Best Practices

1. **Cache Management**: Analytics data is cached for 5 minutes. The cache automatically refreshes when stale.

2. **Performance**: For large datasets, consider implementing pagination or lazy loading for project lists.

3. **Real-time Updates**: The analytics page automatically updates every minute when mounted.

4. **Error Handling**: Always wrap analytics calculations in try-catch blocks to handle edge cases.

5. **Data Visualization**: Choose chart types based on data:
   - Use **line charts** for continuous data trends
   - Use **bar charts** for discrete comparisons
   - Use **area charts** for cumulative metrics

## Future Enhancements

Potential improvements for the analytics module:

- Historical data persistence (database integration)
- Predictive analytics using ML models
- Customizable dashboards with drag-and-drop widgets
- Real-time WebSocket updates for live metrics
- Advanced filtering and search capabilities
- Comparison tools for multiple projects
- Email/scheduled report delivery
- API endpoints for external analytics tools

## Contributing

When adding new analytics features:

1. Add metric calculations to `metrics.ts`
2. Update TypeScript interfaces for new data types
3. Create or update visualization components
4. Update export functions if new data is added
5. Add documentation to this README
6. Write tests for metric calculations

## License

Part of the Benefaction Platform - Ergo project.
