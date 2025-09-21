# WellPlate Pal

WellPlate Pal is a web-based application for designing and analyzing well plate experiments. It provides a user-friendly interface for creating plate layouts, inputting data, and performing various analyses.

## Features

- **Experiment Design:**
    - Customizable plate formats (6, 12, 24, 48, 96-well).
    - Group management for different experimental conditions.
    - Automated and manual plate layout generation.
    - Randomization of well positions to prevent plate effects.

- **Data Input:**
    - Define multiple data targets (e.g., IL-6, IL-8, Total Protein).
    - Paste data from spreadsheets or enter it manually.

- **Analysis:**
    - Basic analysis: mean, standard deviation, and normalization.
    - Advanced analysis: Z'-factor for assay quality and 4PL curve fitting for dose-response analysis.

- **Visualization:**
    - Interactive plate layout.
    - Heatmap visualization of data.
    - Bar charts for group comparisons.
    - Scatter plots for dose-response curves.

- **Session Management:**
    - Save and load experiment sessions to/from the browser's local storage.
    - Import and export sessions as JSON files.

- **Exporting:**
    - Export plate layouts as PNG or SVG images.
    - Export analysis results as CSV files.

- **Calculators:**
    - Handy calculators for common lab tasks like dilutions, molarity, and cell seeding.

## How to Use

1.  **Design Your Plate:**
    - Go to the "Design" tab.
    - Name your experiment.
    - Select a plate format.
    - Add treatment groups.
    - Design your plate layout by painting wells or using the automated layout generator.

2.  **Input Data:**
    - Go to the "Data Input" tab.
    - Define your data targets.
    - Paste your data or enter it manually for each well.

3.  **Analyze Your Data:**
    - Go to the "Analysis" and "Advanced Analysis" tabs to view your results.
    - Use the various analysis tools to get insights from your data.

4.  **Export Your Results:**
    - Go to the "Export & Notes" tab to export your plate layout, results, and charts.

## Live Demo

You can try out WellPlate Pal here: [https://esanant.github.io/WellPlatesExperiments/](https://esanant.github.io/WellPlatesExperiments/)