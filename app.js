// --- APP INITIALIZATION --- //
document.addEventListener('DOMContentLoaded', () => { window.app = new WellPlatePalApp(); });

class WellPlatePalApp {
    constructor() {
        // Master state object
        this.state = {
            settings: { expName: '', plateFormat: '96', replicates: 3, layoutDirection: 'by-row', notes: '' },
            groups: [], // { name: 'Control', color: '#RRGGBB', type: 'Normal'/'Dose-Response', concentrations: [] }
            layout: {}, // { 'A1': { group: 'Control', replicate: 1 }, ... }
            data: { targets: ['Default'], values: {}, activeTarget: 'Default' },   // { targets: ['IL-6', 'IL-8'], values: { 'A1': { 'IL-6': 1.23, 'IL-8': 4.56 } } }
            analysis: { blankControl: '', positiveControl: '', heatmapMode: 'raw' },
            ui: { activeSection: 'design', activeGroup: null, interactionMode: 'paint', isPainting: false, selectedWellData: null }
        };
        this.plateConfigs = {"96":{rows:8,cols:12,rowLabels:['A','B','C','D','E','F','G','H']},"48":{rows:6,cols:8,rowLabels:['A','B','C','D','E','F']},"24":{rows:4,cols:6,rowLabels:['A','B','C','D']},"12":{rows:3,cols:4,rowLabels:['A','B','C']},"6":{rows:2,cols:3,rowLabels:['A','B']}};
        this.baseColors = ['#2dd4bf', '#60a5fa', '#c084fc', '#f87171', '#fbbf24', '#a3e635', '#f472b6', '#34d399', '#818cf8', '#fca5a5', '#fde047', '#4ade80'];
        this.doseResponseChart = null;
        this.init();
    }

    init() {
        this.buildCalculatorDOM();
        this.setupEventListeners();
        this.loadSessions();
        this.switchTab(this.state.ui.activeSection);
    }

    // --- CORE STATE & RENDER --- //
    setState(updater) { updater(this.state); this.render(); }
    render() {
        // Sync simple inputs with state
        const { settings, ui } = this.state;
        document.getElementById('exp-name').value = settings.expName;
        document.getElementById('plate-format').value = settings.plateFormat;
        document.getElementById('replicates').value = settings.replicates;
        document.getElementById('layout-direction').value = settings.layoutDirection;
        document.getElementById('exp-notes').value = settings.notes;

        // Render complex components based on active tab
        const activeTab = ui.activeSection;
        if (activeTab === 'design') { this.renderGroups(); this.renderPlate(); this.renderLegend(); this.renderInteractionMode(); this.renderActiveGroup(); }
        if (activeTab === 'data-input') { this.renderDataGrid(); this.renderDataTargets(); }
        if (activeTab === 'analysis') { this.renderAnalysisControls(); this.renderAnalysisResults(); this.renderHeatmap(); }
        if (activeTab === 'advanced-analysis') { this.renderZFactor(); this.renderDoseResponse(); }
    }
    
    // --- EVENT LISTENERS --- //
    setupEventListeners() {
        // Settings
        document.getElementById('exp-name').addEventListener('input', e => this.state.settings.expName = e.target.value);
        document.getElementById('plate-format').addEventListener('change', e => this.setState(s => { s.settings.plateFormat = e.target.value; s.layout = {}; s.data = { targets: ['Default'], values: {}, activeTarget: 'Default' }; }));
        document.getElementById('replicates').addEventListener('input', e => this.state.settings.replicates = parseInt(e.target.value) || 1);
        document.getElementById('layout-direction').addEventListener('change', e => this.state.settings.layoutDirection = e.target.value);
        document.getElementById('exp-notes').addEventListener('input', e => this.state.settings.notes = e.target.value);
        // Design Actions
        document.getElementById('group-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.addGroup(e.target.value); e.target.value = ''; } });
        document.getElementById('group-type-select').addEventListener('change', e => this.setGroupType(this.state.ui.activeGroup, e.target.value));
        document.getElementById('generate-layout-btn').addEventListener('click', () => this.generateLayout());
        document.getElementById('randomize-btn').addEventListener('click', () => this.randomizeLayout());
        document.getElementById('paint-mode-btn').addEventListener('click', () => this.setState(s => s.ui.interactionMode = 'paint'));
        document.getElementById('erase-mode-btn').addEventListener('click', () => this.setState(s => s.ui.interactionMode = 'erase'));
        // Data Input
        document.getElementById('selected-well-input').addEventListener('change', e => this.updateWellData(this.state.ui.selectedWellData, e.target.value));
        document.getElementById('add-target-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.addDataTarget(e.target.value); e.target.value = ''; } });
        // Analysis
        document.getElementById('blank-control-select').addEventListener('change', e => this.setState(s => s.analysis.blankControl = e.target.value));
        document.getElementById('positive-control-select').addEventListener('change', e => this.setState(s => s.analysis.positiveControl = e.target.value));
        document.getElementById('heatmap-raw-btn').addEventListener('click', () => this.setState(s => s.analysis.heatmapMode = 'raw'));
        document.getElementById('heatmap-norm-btn').addEventListener('click', () => this.setState(s => s.analysis.heatmapMode = 'normalized'));
        // Import
        document.getElementById('import-json').addEventListener('change', e => this.importSession(e));
    }

    // --- UI & TAB MANAGEMENT --- //
    switchTab(sectionId) {
        this.setState(s => s.ui.activeSection = sectionId);
        document.querySelectorAll('.app-section').forEach(s => s.classList.remove('active'));
        document.getElementById(sectionId)?.classList.add('active');
        document.querySelectorAll('.main-tab').forEach(t => t.classList.toggle('active', t.dataset.tabId === sectionId));
    }

    // --- DESIGN TAB LOGIC --- //
    addGroup(name) {
        name = name.trim(); if (!name || this.state.groups.some(g => g.name === name)) return;
        const newGroup = { name, color: this.baseColors[this.state.groups.length % this.baseColors.length], type: 'Normal', concentrations: [] };
        this.setState(s => { 
            s.groups.push(newGroup); 
            s.ui.activeGroup = name; 
            s.ui.interactionMode = 'paint'; 
        });
        this.showNotification(`Group "${name}" added and selected. You can now paint on the plate.`, 'info');
    }
    removeGroup(name) {
        this.setState(s => {
            s.groups = s.groups.filter(g => g.name !== name);
            Object.keys(s.layout).forEach(well => { if (s.layout[well]?.group === name) delete s.layout[well]; });
            if (s.ui.activeGroup === name) s.ui.activeGroup = s.groups[0]?.name || null;
        });
    }
    setGroupType(groupName, type) {
        if (!groupName) return;
        this.setState(s => {
            const group = s.groups.find(g => g.name === groupName);
            if (group) group.type = type;
        });
    }
    generateLayout() {
        const { groups, settings } = this.state; if (groups.length === 0) return;
        const plateConfig = this.plateConfigs[settings.plateFormat];
        if (groups.length * settings.replicates > plateConfig.rows * plateConfig.cols) return this.showNotification('Not enough wells for this layout.', 'error');
        const newLayout = {}; let wellIndex = 0;
        const assign = (groupName, repNum) => {
            let row, col;
            if (settings.layoutDirection === 'by-row') { row = Math.floor(wellIndex / plateConfig.cols); col = wellIndex % plateConfig.cols; } 
            else { row = wellIndex % plateConfig.rows; col = Math.floor(wellIndex / plateConfig.cols); }
            if(row < plateConfig.rows) {
                newLayout[`${plateConfig.rowLabels[row]}${col + 1}`] = { group: groupName, replicate: repNum }; wellIndex++;
            }
        };
        for (const group of groups) { for (let r = 1; r <= settings.replicates; r++) assign(group.name, r); }
        this.setState(s => s.layout = newLayout);
    }
    randomizeLayout() {
        const layoutValues = Object.values(this.state.layout); if (layoutValues.length === 0) return;
        const wellNames = this.getWellList().slice(0, layoutValues.length);
        // Fisher-Yates shuffle
        for (let i = wellNames.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [wellNames[i], wellNames[j]] = [wellNames[j], wellNames[i]]; }
        const newLayout = {};
        layoutValues.forEach((value, index) => { newLayout[wellNames[index]] = value; });
        this.setState(s => s.layout = newLayout);
    }
    clearLayout() { this.setState(s => { s.layout = {}; s.data = { targets: ['Default'], values: {}, activeTarget: 'Default' }; }); }
    handleWellInteraction(wellName, eventType) {
        if (eventType === 'start') this.state.ui.isPainting = true;
        if (eventType === 'end') { this.state.ui.isPainting = false; return; }
        if (!this.state.ui.isPainting || !wellName) return;
        const { interactionMode, activeGroup } = this.state.ui;
        if (interactionMode === 'paint') {
            if (!activeGroup) { this.state.ui.isPainting = false; return this.showNotification('Select a group to paint.', 'info'); }
            const existing = this.state.layout[wellName]; if (existing?.group === activeGroup) return;
            const oldGroup = existing?.group;
            this.setState(s => {
                const reps = Object.values(s.layout).filter(w => w.group === activeGroup).length;
                s.layout[wellName] = { group: activeGroup, replicate: reps + 1 };
                if (oldGroup) this.updateReplicates(oldGroup);
                this.updateReplicates(activeGroup);
            });
        } else if (interactionMode === 'erase') {
            const oldGroup = this.state.layout[wellName]?.group;
            if (oldGroup) this.setState(s => { delete s.layout[wellName]; this.updateReplicates(oldGroup); });
        }
    }
    updateReplicates(groupName) {
        let count = 1; 
        this.getWellList().forEach(well => { 
            if (this.state.layout[well]?.group === groupName) {
                this.state.layout[well].replicate = count++; 
            }
        });
    }
    getWellList() { const wells = [], conf = this.plateConfigs[this.state.settings.plateFormat]; for (let i=0;i<conf.rows;i++) for (let j=0;j<conf.cols;j++) wells.push(`${conf.rowLabels[i]}${j + 1}`); return wells; }
    
    // --- DATA INPUT TAB LOGIC --- //
    addDataTarget(name) {
        name = name.trim();
        if (!name || this.state.data.targets.includes(name)) return;
        this.setState(s => {
            s.data.targets.push(name);
            s.data.activeTarget = name;
        });
    }
    removeDataTarget(name) {
        if (this.state.data.targets.length <= 1) return this.showNotification('Cannot remove the last data target.', 'error');
        this.setState(s => {
            s.data.targets = s.data.targets.filter(t => t !== name);
            if (s.data.activeTarget === name) s.data.activeTarget = s.data.targets[0];
            // Also remove data associated with this target
            Object.values(s.data.values).forEach(wellData => delete wellData[name]);
        });
    }
    setActiveDataTarget(name) {
        this.setState(s => s.data.activeTarget = name);
    }
    parsePastedData() {
        const text = document.getElementById('paste-data-input').value.trim();
        const rows = text.split('\n').map(r => r.split(/[\t,]/));
        const plateConfig = this.plateConfigs[this.state.settings.plateFormat];
        if (rows.length > plateConfig.rows || rows[0].length > plateConfig.cols) return this.showNotification('Pasted data dimensions exceed plate format.', 'error');
        
        const { activeTarget } = this.state.data;
        this.setState(s => {
            rows.forEach((row, rIdx) => {
                row.forEach((val, cIdx) => {
                    const wellName = `${plateConfig.rowLabels[rIdx]}${cIdx + 1}`;
                    const numVal = parseFloat(val);
                    if (!isNaN(numVal)) {
                        if (!s.data.values[wellName]) s.data.values[wellName] = {};
                        s.data.values[wellName][activeTarget] = numVal;
                    }
                });
            });
        });
    }
    selectWellForDataInput(wellName) {
        this.setState(s => s.ui.selectedWellData = wellName);
        document.getElementById('selected-well-label').textContent = wellName;
        const input = document.getElementById('selected-well-input');
        const { activeTarget } = this.state.data;
        input.value = this.state.data.values[wellName]?.[activeTarget] || '';
        input.focus();
    }
    updateWellData(wellName, value) {
        if (!wellName) return;
        const numVal = parseFloat(value);
        const { activeTarget } = this.state.data;
        this.setState(s => {
            if (!s.data.values[wellName]) s.data.values[wellName] = {};
            if (!isNaN(numVal)) {
                s.data.values[wellName][activeTarget] = numVal;
            } else {
                delete s.data.values[wellName][activeTarget];
            }
        });
    }

    // --- ANALYSIS TAB LOGIC --- //
    getAnalysisData() {
        const { layout, data, analysis, groups } = this.state;
        const { values, activeTarget } = data;

        const blankValues = Object.keys(layout).filter(w => layout[w].group === analysis.blankControl).map(w => values[w]?.[activeTarget]).filter(v => v !== undefined);
        const positiveValues = Object.keys(layout).filter(w => layout[w].group === analysis.positiveControl).map(w => values[w]?.[activeTarget]).filter(v => v !== undefined);
        const avgBlank = blankValues.length ? blankValues.reduce((a,b)=>a+b,0) / blankValues.length : 0;
        const avgPositive = positiveValues.length ? positiveValues.reduce((a,b)=>a+b,0) / positiveValues.length : 0;
        const range = avgPositive - avgBlank;
        
        const results = {};
        groups.forEach(g => {
            const wells = Object.keys(layout).filter(w => layout[w].group === g.name);
            const raw = wells.map(w => values[w]?.[activeTarget]).filter(v => v !== undefined);
            if (raw.length === 0) return;
            
            const sum = raw.reduce((a,b)=>a+b,0);
            const mean = sum / raw.length;
            const stdDev = raw.length > 1 ? Math.sqrt(raw.map(x => Math.pow(x - mean, 2)).reduce((a,b)=>a+b,0) / (raw.length - 1)) : 0;
            
            const normalized = raw.map(v => range ? ((v - avgBlank) / range) * 100 : 0);
            const normMean = normalized.length ? normalized.reduce((a,b)=>a+b,0) / normalized.length : 0;
            
            results[g.name] = { mean, stdDev, normMean };
        });
        return { results, avgBlank, range };
    }
    
    // --- ADVANCED ANALYSIS --- //
    calculateZFactor() {
        const posGroup = document.getElementById('z-pos-control').value;
        const negGroup = document.getElementById('z-neg-control').value;
        if (!posGroup || !negGroup) return;

        const posData = this.getGroupData(posGroup).raw;
        const negData = this.getGroupData(negGroup).raw;

        if (posData.length < 2 || negData.length < 2) {
            document.getElementById('z-factor-result').innerHTML = `<p class="text-sm text-amber-700">Not enough data points for selected controls.</p>`;
            return;
        }

        const meanPos = posData.reduce((a, b) => a + b, 0) / posData.length;
        const meanNeg = negData.reduce((a, b) => a + b, 0) / negData.length;
        const sdPos = Math.sqrt(posData.map(x => Math.pow(x - meanPos, 2)).reduce((a,b)=>a+b,0) / (posData.length-1));
        const sdNeg = Math.sqrt(negData.map(x => Math.pow(x - meanNeg, 2)).reduce((a,b)=>a+b,0) / (negData.length-1));

        const zFactor = 1 - (3 * (sdPos + sdNeg)) / Math.abs(meanPos - meanNeg);
        
        let interpretation = '';
        if (zFactor < 0.5) interpretation = 'Sub-optimal for HTS';
        else if (zFactor >= 0.5 && zFactor < 0.7) interpretation = 'Good for HTS';
        else if (zFactor >= 0.7) interpretation = 'Excellent for HTS';

        document.getElementById('z-factor-result').innerHTML = `
            <div class="text-2xl font-bold text-teal-600">${zFactor.toFixed(3)}</div>
            <div class="text-sm font-semibold text-slate-600">${interpretation}</div>`;
    }
    
    async performFourPL(data) {
        // Pure JavaScript estimation of 4PL parameters
        const concentrations = data.map(d => d.x);
        const responses = data.map(d => d.y);

        if (concentrations.length < 4) {
            this.showNotification("At least 4 data points are required for a 4PL fit.", "error");
            return { ic50: NaN, top: 0, bottom: 0, hillSlope: 1 };
        }

        // 1. Estimate Top and Bottom from min/max of responses
        let top = Math.max(...responses);
        let bottom = Math.min(...responses);
        if (top === bottom) return { ic50: NaN, top, bottom, hillSlope: 0 };
        
        // Ensure Top is greater than Bottom for calculations
        if (top < bottom) [top, bottom] = [bottom, top];

        // 2. Estimate IC50 via log-linear interpolation
        const halfResponse = bottom + (top - bottom) / 2;
        const sortedData = [...data].sort((a,b) => a.x - b.x);
        
        let p1, p2;
        for(let i = 0; i < sortedData.length - 1; i++){
            if((sortedData[i].y >= halfResponse && sortedData[i+1].y <= halfResponse) || (sortedData[i].y <= halfResponse && sortedData[i+1].y >= halfResponse)){
                p1 = sortedData[i];
                p2 = sortedData[i+1];
                break;
            }
        }
        
        let ic50;
        if (p1 && p2 && p1.x > 0 && p2.x > 0) {
             const logP1x = Math.log10(p1.x);
             const logP2x = Math.log10(p2.x);
             const slope = (p2.y - p1.y) / (logP2x - logP1x);
             if (slope !== 0) {
                const logIC50 = logP1x + (halfResponse - p1.y) / slope;
                ic50 = Math.pow(10, logIC50);
             } else {
                ic50 = (p1.x + p2.x) / 2; // Fallback if slope is horizontal
             }
        } else {
            // If we can't bracket the 50% point, use the median concentration as a guess.
            const sortedConc = concentrations.filter(c => c > 0).sort((a,b) => a-b);
            ic50 = sortedConc[Math.floor(sortedConc.length / 2)];
        }
        
        // 3. Estimate Hill Slope by linearizing the Hill equation and performing a linear regression
        const transformedPoints = [];
        for (const point of data) {
            // Use only points strictly between top and bottom for stable log transformation
            if (point.y > bottom && point.y < top && point.x > 0) {
                const y_transformed = Math.log10((top - point.y) / (point.y - bottom));
                const x_transformed = Math.log10(point.x);
                if (isFinite(y_transformed) && isFinite(x_transformed)) {
                    transformedPoints.push({ x: x_transformed, y: y_transformed });
                }
            }
        }

        let hillSlope = 1.0; // Default if regression fails
        if (transformedPoints.length >= 2) {
            const n = transformedPoints.length;
            const sumX = transformedPoints.reduce((acc, p) => acc + p.x, 0);
            const sumY = transformedPoints.reduce((acc, p) => acc + p.y, 0);
            const sumXY = transformedPoints.reduce((acc, p) => acc + p.x * p.y, 0);
            const sumX2 = transformedPoints.reduce((acc, p) => acc + p.x * p.x, 0);

            const numerator = (n * sumXY) - (sumX * sumY);
            const denominator = (n * sumX2) - (sumX * sumX);
            
            if (denominator !== 0) {
                // The slope of the linearized plot is the negative Hill slope
                hillSlope = -(numerator / denominator);
            }
        }
        
        return {
            ic50: ic50 || 0,
            top: top,
            bottom: bottom,
            hillSlope: hillSlope,
        };
    }

    // --- DYNAMIC RENDERING --- //
    renderPlate() { 
        const container = document.getElementById('plate-container');
        if (!container) return;
        const plateConfig = this.plateConfigs[this.state.settings.plateFormat];
        if (Object.keys(this.state.layout).length === 0 && this.state.groups.length === 0) {
            container.innerHTML = `<div class="text-center text-slate-500 p-4">
            <h3 class="font-semibold text-lg mb-2">Welcome to WellPlate Pal!</h3>
            <p class="mb-4">A simple tool to design and analyze your well plate experiments.</p>
            <ol class="text-left max-w-md mx-auto list-decimal list-inside space-y-2">
                <li><strong>Name Your Experiment:</strong> Give your experiment a name in the "Experiment Setup" panel.</li>
                <li><strong>Add Treatment Groups:</strong> In the "Group Management" panel, type the name of a condition (e.g., "Control", "Drug A") and press Enter.</li>
                <li><strong>Design Your Plate:</strong> Click a group to select it, then click or drag on the wells to paint your layout.</li>
                <li><strong>Input Data:</strong> Go to the "Data Input" tab to paste or manually enter your experimental results.</li>
                <li><strong>Analyze:</strong> Use the "Analysis" and "Advanced Analysis" tabs to see your results.</li>
            </ol>
            </div>`;
            return;
        }
        container.innerHTML = ''; // Clear previous
        const { rows, cols, rowLabels } = plateConfig;
        const svg = this._createSVGElement('svg', { viewBox: `0 0 ${cols * 50 + 40} ${rows * 50 + 40}` });
        
        // Labels
        for (let i = 0; i < rows; i++) svg.appendChild(this._createSVGElement('text', { x: 15, y: i * 50 + 55, class: 'font-semibold text-slate-500 text-sm', 'text-anchor': 'middle' }, rowLabels[i]));
        for (let j = 0; j < cols; j++) svg.appendChild(this._createSVGElement('text', { x: j * 50 + 55, y: 15, class: 'font-semibold text-slate-500 text-sm', 'text-anchor': 'middle' }, j + 1));

        // Wells
        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                const wellName = `${rowLabels[i]}${j + 1}`;
                const wellData = this.state.layout[wellName];
                const groupInfo = wellData ? this.state.groups.find(g => g.name === wellData.group) : null;
                const g = this._createSVGElement('g');
                
                const circle = this._createSVGElement('circle', {
                    cx: j * 50 + 55, cy: i * 50 + 55, r: 20,
                    class: 'well stroke-slate-400 stroke-[0.5] transition-all',
                    fill: groupInfo ? groupInfo.color : '#F8FAFC'
                });
                
                g.dataset.wellName = wellName;
                g.addEventListener('mouseenter', (e) => this.showTooltip(e, wellData, wellName));
                g.addEventListener('mouseleave', () => this.hideTooltip());
                g.addEventListener('mousedown', (e) => { this.handleWellInteraction(wellName, 'start'); e.preventDefault(); });
                g.addEventListener('mouseover', () => this.handleWellInteraction(wellName, 'drag'));
                
                g.appendChild(circle);

                if (wellData && groupInfo) {
                    const groupIndex = this.state.groups.indexOf(groupInfo) + 1;
                    g.appendChild(this._createSVGElement('text', {x: j*50+55, y: i*50+60, class: 'fill-white font-bold text-lg pointer-events-none', 'text-anchor':'middle'}, groupIndex));
                }
                svg.appendChild(g);
            }
        }
        container.appendChild(svg);
        // This global listener handles when the mouse is released anywhere on the page
        document.body.addEventListener('mouseup', () => this.handleWellInteraction(null, 'end'), { once: true });
    }
    renderDataGrid() {
        const container = document.getElementById('data-grid-container');
        if (!container) return;
        const plateConfig = this.plateConfigs[this.state.settings.plateFormat];
        container.innerHTML = '';
        const { rows, cols, rowLabels } = plateConfig;
        const svg = this._createSVGElement('svg', { viewBox: `0 0 ${cols * 60 + 40} ${rows * 60 + 40}` });

        for (let i = 0; i < rows; i++) svg.appendChild(this._createSVGElement('text', { x: 15, y: i * 60 + 65, class: 'font-semibold text-slate-500 text-sm', 'text-anchor': 'middle' }, rowLabels[i]));
        for (let j = 0; j < cols; j++) svg.appendChild(this._createSVGElement('text', { x: j * 60 + 65, y: 15, class: 'font-semibold text-slate-500 text-sm', 'text-anchor': 'middle' }, j + 1));

        const { values, activeTarget } = this.state.data;

        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                const wellName = `${rowLabels[i]}${j + 1}`;
                const wellValue = values[wellName]?.[activeTarget];
                const g = this._createSVGElement('g', { class: 'cursor-pointer' });
                
                const rect = this._createSVGElement('rect', {
                    x: j * 60 + 35, y: i * 60 + 35, width: 50, height: 50, rx: 8,
                    class: 'stroke-slate-300 fill-white well'
                });
                if (wellName === this.state.ui.selectedWellData) rect.classList.add('stroke-teal-500', 'stroke-2');

                g.appendChild(rect);
                const valueText = wellValue !== undefined ? (Math.abs(wellValue) < 0.01 && wellValue !== 0 ? wellValue.toExponential(1) : wellValue.toFixed(3)) : '-';
                g.appendChild(this._createSVGElement('text', {x:j*60+60, y:i*60+65, class: 'text-slate-700 font-mono text-[11px] pointer-events-none', 'text-anchor':'middle'}, valueText));
                g.onclick = () => this.selectWellForDataInput(wellName);
                svg.appendChild(g);
            }
        }
        container.appendChild(svg);
    }
    renderDataTargets() {
        const container = document.getElementById('data-targets-container');
        if (!container) return;
        const { targets, activeTarget } = this.state.data;
        container.innerHTML = '';
        targets.forEach(target => {
            const isActive = target === activeTarget;
            const button = document.createElement('button');
            button.className = `data-target-btn flex items-center gap-2 text-sm font-medium pl-3 pr-2 py-1 rounded-full cursor-pointer transition ${isActive ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-600'}`;
            button.innerHTML = `<span>${target}</span><button class="w-4 h-4 rounded-full bg-black/10 text-white flex items-center justify-center text-xs hover:bg-black/20">&times;</button>`;
            button.onclick = () => this.setActiveDataTarget(target);
            button.querySelector('button').onclick = e => { e.stopPropagation(); this.removeDataTarget(target); };
            container.appendChild(button);
        });
    }
    renderHeatmap() {
        const container = document.getElementById('heatmap-container');
        if (!container) return;
        const plateConfig = this.plateConfigs[this.state.settings.plateFormat];
        container.innerHTML = '';
        const { results, avgBlank, range } = this.getAnalysisData();
        const allValues = Object.values(this.state.data.values).map(well => well[this.state.data.activeTarget]).filter(v => v !== undefined);
        if (allValues.length === 0) {
            container.innerHTML = `<div class="text-center text-slate-500 p-4">Enter data in the "Data Input" tab to see a heatmap.</div>`;
            return;
        }

        const { rows, cols, rowLabels } = plateConfig;
        const svg = this._createSVGElement('svg', { viewBox: `0 0 ${cols * 50 + 40} ${rows * 50 + 40}` });
        
        let minVal, maxVal;
        if (this.state.analysis.heatmapMode === 'normalized') {
            minVal = 0; maxVal = 100;
        } else {
            minVal = Math.min(...allValues); maxVal = Math.max(...allValues);
        }
        
        const colorScale = (value) => {
            if (value === undefined) return '#E2E8F0'; // slate-200
            const percent = (maxVal - minVal) === 0 ? 0.5 : (value - minVal) / (maxVal - minVal);
            const h = (1 - percent) * 240; // Blue to Red
            return `hsl(${h}, 80%, 60%)`;
        };

        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                const wellName = `${rowLabels[i]}${j + 1}`;
                let value;
                if (this.state.analysis.heatmapMode === 'normalized') {
                    const rawVal = this.state.data.values[wellName]?.[this.state.data.activeTarget];
                    value = (rawVal !== undefined && range) ? ((rawVal - avgBlank) / range) * 100 : undefined;
                } else {
                    value = this.state.data.values[wellName]?.[this.state.data.activeTarget];
                }
                const rect = this._createSVGElement('rect', {
                    x: j * 50 + 35, y: i * 50 + 35, width: 48, height: 48, rx: 4,
                    fill: colorScale(value),
                    'data-tooltip': `${wellName}: ${value !== undefined ? value.toFixed(2) : 'N/A'}`
                });
                rect.addEventListener('mouseenter', (e) => {
                    const tooltip = document.getElementById('tooltip');
                    tooltip.textContent = e.target.getAttribute('data-tooltip');
                    const domRect = e.target.getBoundingClientRect();
                    tooltip.style.left = `${domRect.left + domRect.width / 2 - tooltip.offsetWidth / 2}px`;
                    tooltip.style.top = `${domRect.top - tooltip.offsetHeight - 5}px`;
                    tooltip.classList.remove('opacity-0');
                });
                rect.addEventListener('mouseleave', () => this.hideTooltip());
                svg.appendChild(rect);
            }
        }
         container.appendChild(svg);
    }
    renderGroups() {
         const container = document.getElementById('group-tags');
        container.querySelectorAll('.group-tag').forEach(tag => tag.remove());
        const input = container.querySelector('input');
        this.state.groups.forEach(group => {
            const tag = document.createElement('span');
            const isActive = this.state.ui.activeGroup === group.name;
            tag.className = `group-tag flex items-center gap-2 text-sm font-medium pl-3 pr-2 py-1 rounded-full cursor-pointer transition ${isActive ? 'ring-2 ring-offset-1 ring-teal-500' : ''}`;
            tag.style.backgroundColor = group.color;
            tag.style.color = 'white';
            tag.innerHTML = `<span>${group.name}${group.type === 'Dose-Response' ? ' (DR)' : ''}</span><button class="w-4 h-4 rounded-full bg-black/20 text-white flex items-center justify-center text-xs hover:bg-black/40">&times;</button>`;
            tag.onclick = () => this.setState(s => s.ui.activeGroup = group.name);
            tag.querySelector('button').onclick = e => { e.stopPropagation(); this.removeGroup(group.name); };
            container.insertBefore(tag, input);
        });
    }
    renderLegend() {
        const legend = document.getElementById('legend');
        if(!legend) return;
        legend.innerHTML = '';
        this.state.groups.forEach((group, index) => {
            const item = document.createElement('div');
            item.className = 'flex items-center gap-2 text-sm';
            item.innerHTML = `<div class="flex items-center justify-center w-4 h-4 rounded-full font-bold text-xs text-white" style="background-color: ${group.color};">${index + 1}</div><span>${group.name}</span>`;
            legend.appendChild(item);
        });
    }
    renderInteractionMode() {
        const paintBtn = document.getElementById('paint-mode-btn');
        const eraseBtn = document.getElementById('erase-mode-btn');
        const container = document.getElementById('plate-container');
        if (!paintBtn || !eraseBtn || !container) return;
        paintBtn.classList.toggle('bg-teal-100', this.state.ui.interactionMode === 'paint');
        eraseBtn.classList.toggle('bg-red-100', this.state.ui.interactionMode === 'erase');
        container.classList.toggle('paint-mode', this.state.ui.interactionMode === 'paint');
        container.classList.toggle('erase-mode', this.state.ui.interactionMode === 'erase');
    }
    renderActiveGroup() {
        const indicator = document.getElementById('active-group-indicator');
        const label = document.getElementById('active-group-label');
        const groupTypeSelect = document.getElementById('group-type-select');
        if (!indicator || !label || !groupTypeSelect) return;
        const { activeGroup } = this.state.ui;
        if (activeGroup) {
            const group = this.state.groups.find(g => g.name === activeGroup);
            if (group) {
                indicator.classList.remove('hidden'); indicator.classList.add('flex');
                label.textContent = group.name; label.style.backgroundColor = group.color;
                groupTypeSelect.value = group.type;
            }
        } else { indicator.classList.add('hidden'); }
    }
    renderAnalysisControls() {
        const blankSelect = document.getElementById('blank-control-select');
        const posSelect = document.getElementById('positive-control-select');
        const comparisonGroupsSelect = document.getElementById('comparison-groups-select');
        const comparisonTargetSelect = document.getElementById('comparison-target-select');

        if (!blankSelect || !posSelect || !comparisonGroupsSelect || !comparisonTargetSelect) return;

        const groupOptions = this.state.groups.map(g => `<option value="${g.name}">${g.name}</option>`).join('');
        const targetOptions = this.state.data.targets.map(t => `<option value="${t}">${t}</option>`).join('');

        blankSelect.innerHTML = `<option value="">None</option>${groupOptions}`;
        posSelect.innerHTML = `<option value="">None</option>${groupOptions}`;
        comparisonGroupsSelect.innerHTML = groupOptions;
        comparisonTargetSelect.innerHTML = targetOptions;

        blankSelect.value = this.state.analysis.blankControl;
        posSelect.value = this.state.analysis.positiveControl;
        comparisonTargetSelect.value = this.state.data.activeTarget;
    }

    renderComparisonChart() {
        const selectedGroups = Array.from(document.getElementById('comparison-groups-select').selectedOptions).map(opt => opt.value);
        const selectedTarget = document.getElementById('comparison-target-select').value;

        if (selectedGroups.length === 0 || !selectedTarget) {
            return this.showNotification('Please select at least one group and a data target to compare.', 'info');
        }

        const chartData = {
            labels: selectedGroups,
            datasets: [{
                label: selectedTarget,
                data: selectedGroups.map(groupName => {
                    const groupData = this.getGroupData(groupName, selectedTarget);
                    return groupData.mean;
                }),
                backgroundColor: selectedGroups.map(groupName => {
                    const group = this.state.groups.find(g => g.name === groupName);
                    return group ? group.color : '#cccccc';
                }),
                borderColor: selectedGroups.map(groupName => {
                    const group = this.state.groups.find(g => g.name === groupName);
                    return group ? group.color : '#cccccc';
                }),
                borderWidth: 1,
                errorBars: selectedGroups.reduce((acc, groupName) => {
                    const groupData = this.getGroupData(groupName, selectedTarget);
                    acc[groupName] = { plus: groupData.stdDev, minus: groupData.stdDev };
                    return acc;
                }, {})
            }]
        };

        const ctx = document.getElementById('comparison-chart').getContext('2d');
        if (this.comparisonChart) {
            this.comparisonChart.destroy();
        }

        this.comparisonChart = new Chart(ctx, {
            type: 'bar',
            data: chartData,
            options: {
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: selectedTarget }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += context.parsed.y.toFixed(3);
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }
    renderAnalysisResults() {
        const container = document.getElementById('analysis-results-table');
        if(!container) return;
        const { results } = this.getAnalysisData();
        if (Object.keys(results).length === 0) {
            container.innerHTML = `<p class="text-slate-500">No data to analyze.</p>`;
            return;
        }
        let table = `<table class="w-full text-left border-collapse"><thead class="bg-slate-100"><tr><th class="p-2 border">Group</th><th class="p-2 border">Avg</th><th class="p-2 border">StDev</th><th class="p-2 border">Norm. Avg (%)</th></tr></thead><tbody>`;
        for (const groupName in results) {
            const r = results[groupName];
            table += `<tr><td class="p-2 border">${groupName}</td><td class="p-2 border">${r.mean.toFixed(3)}</td><td class="p-2 border">${r.stdDev.toFixed(3)}</td><td class="p-2 border">${r.normMean.toFixed(2)}</td></tr>`;
        }
        table += `</tbody></table>`;
        container.innerHTML = table;
    }
    renderZFactor() {
        const container = document.getElementById('z-factor-container');
        const options = this.state.groups.map(g => `<option value="${g.name}">${g.name}</option>`).join('');
        container.innerHTML = `
            <p class="text-sm text-slate-500 mb-4">Select positive and negative controls to calculate the Z-prime factor, a measure of assay quality.</p>
            <div class="space-y-3">
                <div><label class="block text-sm font-medium text-slate-600 mb-1">Positive Control</label><select id="z-pos-control" class="block w-full text-sm rounded-md border-slate-300"><option value="">-- Select --</option>${options}</select></div>
                <div><label class="block text-sm font-medium text-slate-600 mb-1">Negative Control</label><select id="z-neg-control" class="block w-full text-sm rounded-md border-slate-300"><option value="">-- Select --</option>${options}</select></div>
                <button onclick="app.calculateZFactor()" class="w-full text-sm bg-teal-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-teal-700 transition">Calculate Z'</button>
                <div id="z-factor-result" class="text-center p-4 bg-slate-50 rounded-lg"></div>
            </div>`;
    }
    renderDoseResponse() {
        const container = document.getElementById('dose-response-container');
        const drGroups = this.state.groups.filter(g => g.type === 'Dose-Response');
        if (drGroups.length === 0) {
             container.innerHTML = `<p class="text-sm text-slate-500">To analyze a dose-response curve, first go to the "Design" tab, select a group, and set its type to "Dose-Response Series".</p>`;
             return;
        }
         const options = drGroups.map(g => `<option value="${g.name}">${g.name}</option>`).join('');
         container.innerHTML = `
             <div class="space-y-3">
                <div><label class="block text-sm font-medium text-slate-600 mb-1">Select Dose-Response Group</label><select id="dr-group-select" class="block w-full text-sm rounded-md border-slate-300">${options}</select></div>
                <div class="bg-slate-50 p-3 rounded-lg border">
                    <p class="text-sm font-medium text-slate-600 mb-2">Concentration Series Generator</p>
                    <div class="grid grid-cols-3 gap-2">
                        <input type="number" id="conc-start" placeholder="Start" class="block w-full text-sm rounded-md border-slate-300">
                        <input type="number" id="conc-factor" placeholder="Factor" class="block w-full text-sm rounded-md border-slate-300">
                        <input type="number" id="conc-points" placeholder="Points" class="block w-full text-sm rounded-md border-slate-300">
                    </div>
                     <button onclick="app.generateConcentrationSeries()" class="w-full text-xs mt-2 bg-slate-200 text-slate-700 font-semibold py-1 px-2 rounded-lg hover:bg-slate-300 transition">Generate & Fill</button>
                </div>
                <div><label class="block text-sm font-medium text-slate-600 mb-1">Enter Concentrations (CSV)</label><textarea id="dr-conc-input" class="block w-full text-sm font-mono rounded-md border-slate-300" rows="2" placeholder="e.g., 1000,100,10,1,0.1,0.01"></textarea></div>
                <div class="flex gap-2">
                    <button onclick="app.analyzeDoseResponse()" class="flex-1 w-full text-sm bg-teal-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-teal-700 transition">Analyze</button>
                    <button onclick="app.exportChart()" class="flex-1 w-full text-sm bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-slate-700 transition">Export Chart</button>
                </div>
                <div id="dr-result" class="text-center p-4 bg-slate-50 rounded-lg mt-2"></div>
                <div class="mt-4"><canvas id="dose-response-chart"></canvas></div>
            </div>`;
        document.getElementById('dr-group-select').onchange = () => this.renderDoseResponse(); // Re-render to load concentrations
        const selectedGroup = this.state.groups.find(g => g.name === document.getElementById('dr-group-select').value);
        if (selectedGroup && selectedGroup.concentrations) {
            document.getElementById('dr-conc-input').value = selectedGroup.concentrations.join(',');
        }
    }
    
    // --- CALCULATORS --- //
    buildCalculatorDOM() {
        const container = document.getElementById('calculators');
        const units = {
            conc: ['M', 'mM', 'µM', 'nM', 'pM'],
            vol: ['L', 'mL', 'µL', 'nL'],
            mass: ['kg', 'g', 'mg', 'µg', 'ng']
        };
        const createField = (id, lbl, defaultUnit, unitType) => `
            <div class="grid grid-cols-3 gap-2 items-end">
                <div class="col-span-2"><label for="${id}" class="block text-sm font-medium text-slate-600 mb-1">${lbl}</label><input type="number" id="${id}" class="block w-full text-sm rounded-md border-slate-300 shadow-sm"></div>
                <div><label for="${id}-unit" class="sr-only">Unit</label><select id="${id}-unit" class="block w-full text-sm rounded-md border-slate-300 shadow-sm">${units[unitType].map(u => `<option value="${u}" ${u === defaultUnit ? 'selected':''}>${u}</option>`).join('')}</select></div>
            </div>`;

        const calculators = [
            { id: 'dilution', name: 'Dilution (C1V1)', fields: [createField('c1', 'Stock Conc.', 'µM', 'conc'), createField('c2', 'Final Conc.', 'nM', 'conc'), createField('v2', 'Final Vol.', 'µL', 'vol')], btn: 'Calculate', color: 'emerald', fn: 'calculateDilution' },
            { id: 'molarity', name: 'Molarity', fields: [createField('mass', 'Mass', 'mg', 'mass'), {html: `<div><label for="mw" class="block text-sm font-medium text-slate-600 mb-1">MW (g/mol)</label><input type="number" id="mw" class="block w-full text-sm rounded-md border-slate-300 shadow-sm"></div>`}, createField('vol', 'Volume', 'mL', 'vol')], btn: 'Calculate', color: 'sky', fn: 'calculateMolarity' },
            { id: 'cell-seeding', name: 'Cell Seeding', fields: [{html: `<div><label for="cs-stock" class="block text-sm font-medium text-slate-600 mb-1">Stock (cells/mL)</label><input type="number" id="cs-stock" class="block w-full text-sm rounded-md border-slate-300 shadow-sm"></div>`}, {html: `<div><label for="cs-desired" class="block text-sm font-medium text-slate-600 mb-1">Cells/Well</label><input type="number" id="cs-desired" class="block w-full text-sm rounded-md border-slate-300 shadow-sm"></div>`}, createField('cs-vol', 'Vol./Well', 'µL', 'vol')], btn: 'Calculate', color: 'orange', fn: 'calculateCellSeeding' }
        ];
        container.innerHTML = calculators.map(calc => `
            <div class="bg-white p-5 rounded-lg shadow-sm border border-slate-200">
                <h3 class="text-lg font-semibold mb-4 text-slate-800">${calc.name}</h3>
                <div class="space-y-3">
                    ${calc.fields.map(f => typeof f === 'string' ? f : f.html).join('')}
                    <button onclick="app.${calc.fn}()" class="w-full text-sm bg-${calc.color}-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-${calc.color}-600 transition">${calc.btn}</button>
                    <div id="${calc.id}-result" class="hidden mt-2 text-sm p-3 bg-${calc.color}-50 border-l-4 border-${calc.color}-400 text-${calc.color}-800 rounded-r-lg"></div>
                </div>
            </div>`).join('');
    }
    _getUnitFactor(unit) { const factors = {'pM':1e-12,'nM':1e-9,'µM':1e-6,'mM':1e-3,'M':1,'nL':1e-9,'µL':1e-6,'mL':1e-3,'L':1,'ng':1e-9,'µg':1e-6,'mg':1e-3,'g':1,'kg':1e3}; return factors[unit]; }
    calculateDilution(){ const c1_val = parseFloat(document.getElementById('c1').value); const c1_unit = document.getElementById('c1-unit').value; const c2_val = parseFloat(document.getElementById('c2').value); const c2_unit = document.getElementById('c2-unit').value; const v2_val = parseFloat(document.getElementById('v2').value); const v2_unit = document.getElementById('v2-unit').value; if([c1_val,c2_val,v2_val].some(isNaN)) return; const c1 = c1_val * this._getUnitFactor(c1_unit); const c2 = c2_val * this._getUnitFactor(c2_unit); const v2 = v2_val * this._getUnitFactor(v2_unit); const v1 = (c2 * v2) / c1; const v1_disp = v1 / this._getUnitFactor(v2_unit); const diluent_disp = v2_val - v1_disp; const res = document.getElementById('dilution-result'); res.innerHTML = `Add <strong>${v1_disp.toFixed(2)} ${v2_unit}</strong> of stock to <strong>${diluent_disp.toFixed(2)} ${v2_unit}</strong> of diluent.`; res.classList.remove('hidden'); }
    calculateMolarity(){ const mass_val = parseFloat(document.getElementById('mass').value); const mass_unit = document.getElementById('mass-unit').value; const mw = parseFloat(document.getElementById('mw').value); const vol_val = parseFloat(document.getElementById('vol').value); const vol_unit = document.getElementById('vol-unit').value; if([mass_val,mw,vol_val].some(isNaN)) return; const mass_g = mass_val * this._getUnitFactor(mass_unit) / this._getUnitFactor('g'); const vol_l = vol_val * this._getUnitFactor(vol_unit); const moles = mass_g / mw; const molarity = moles / vol_l; const res = document.getElementById('molarity-result'); res.innerHTML = `Result: <strong>${(molarity*1000).toPrecision(3)} mM</strong> (or ${molarity.toPrecision(3)} M).`; res.classList.remove('hidden'); }
    calculateCellSeeding(){ const stock = parseFloat(document.getElementById('cs-stock').value); const desired = parseFloat(document.getElementById('cs-desired').value); const vol_val = parseFloat(document.getElementById('cs-vol').value); const vol_unit = document.getElementById('cs-vol-unit').value; if([stock,desired,vol_val].some(isNaN)) return; const vol_ml = vol_val * this._getUnitFactor(vol_unit) / this._getUnitFactor('mL'); const stockVol_ml = desired / stock; const stockVol_disp = stockVol_ml * this._getUnitFactor('mL') / this._getUnitFactor(vol_unit); const mediaVol_disp = vol_val - stockVol_disp; if(mediaVol_disp < 0) return this.showNotification('Stock concentration is too low.', 'error'); const res = document.getElementById('cell-seeding-result'); res.innerHTML = `Per well, add:<br><strong>${stockVol_disp.toFixed(2)} ${vol_unit}</strong> cell stock<br><strong>${mediaVol_disp.toFixed(2)} ${vol_unit}</strong> media`; res.classList.remove('hidden'); }
    
    // --- SESSION & EXPORT --- //
    saveSession() { const name = document.getElementById('preset-name').value.trim(); if (!name) return this.showNotification('Please enter a session name.', 'error'); const data = { ...this.state, ui: undefined }; const sessions = JSON.parse(localStorage.getItem('wellPlatePalSessions') || '{}'); sessions[name] = data; localStorage.setItem('wellPlatePalSessions', JSON.stringify(sessions)); this.loadSessions(); this.showNotification(`Session "${name}" saved!`); }
    loadSession() { const name = document.getElementById('preset-select').value; if (!name) return; const sessions = JSON.parse(localStorage.getItem('wellPlatePalSessions') || '{}'); const p = sessions[name]; if(p) { this.setState(s => { Object.assign(s, p); s.ui = { activeSection: 'design', activeGroup: p.groups[0]?.name || null, interactionMode: 'paint', isPainting: false, selectedWellData: null }; }); this.showNotification(`Session "${name}" loaded.`); } }
    deleteSession() { const name = document.getElementById('preset-select').value; if (!name) return; this.showConfirmation(`Delete session "${name}"?`, () => { const sessions = JSON.parse(localStorage.getItem('wellPlatePalSessions') || '{}'); delete sessions[name]; localStorage.setItem('wellPlatePalSessions', JSON.stringify(sessions)); this.loadSessions(); this.showNotification(`Session "${name}" deleted.`); }); }
    loadSessions() { const sessions = JSON.parse(localStorage.getItem('wellPlatePalSessions') || '{}'); const select = document.getElementById('preset-select'); select.innerHTML = '<option value="">-- Load a session --</option>'; Object.keys(sessions).forEach(name => { const opt = document.createElement('option'); opt.value = name; opt.textContent = name; select.appendChild(opt); }); }
    importSession(event) {
        const file = event.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedState = JSON.parse(e.target.result);
                this.setState(s => {
                    Object.assign(s, importedState);
                    s.ui = { activeSection: 'design', activeGroup: importedState.groups[0]?.name || null, interactionMode: 'paint', isPainting: false, selectedWellData: null };
                });
                this.showNotification(`Session "${file.name}" imported successfully.`);
            } catch (err) { this.showNotification('Failed to parse JSON file.', 'error'); }
        };
        reader.readAsText(file);
        event.target.value = ''; // Reset file input
    }
    export(format) {
        const name = this.state.settings.expName.trim() || 'plate-export';
        if (format === 'layout-csv') { let csv = 'Well,Group,Replicate\n'; this.getWellList().forEach(well => { const d = this.state.layout[well]; if(d) csv += `${well},${d.group},${d.replicate}\n`; }); return this._downloadFile(new Blob([csv], {type:'text/csv'}), `${name}_layout.csv`); }
        if (format === 'results-csv') {
            const { results } = this.getAnalysisData();
            let csv = 'Group,Mean,StdDev,NormalizedMean\n';
            for (const groupName in results) { const r = results[groupName]; csv += `${groupName},${r.mean},${r.stdDev},${r.normMean}\n`; }
            return this._downloadFile(new Blob([csv], {type:'text/csv'}), `${name}_results.csv`);
        }
        const svg = document.querySelector(this.state.ui.activeSection === 'analysis' ? '#heatmap-container svg' : '#plate-container svg');
        if (!svg) return this.showNotification('No visual to export.', 'warning');
        const svgData = new XMLSerializer().serializeToString(svg);
        if (format === 'layout-svg') return this._downloadFile(new Blob([svgData], {type:'image/svg+xml'}), `${name}_layout.svg`);
        if (format === 'layout-png') {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas'), scale = 3; canvas.width = img.width*scale; canvas.height = img.height*scale;
                const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(img,0,0,canvas.width,canvas.height);
                canvas.toBlob(blob => this._downloadFile(blob, `${name}_layout.png`));
            };
            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
        }
    }
    
    // --- UTILITIES --- //
    _createSVGElement(tag, attrs, content = '') { const el = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const key in attrs) el.setAttribute(key, attrs[key]); if(content) el.textContent = content; return el; };
    showTooltip(event, wellData, wellName) { const tooltip = document.getElementById('tooltip'); let content = `<strong>${wellName}</strong>`; if (wellData) { content += `<br>${wellData.group} (R${wellData.replicate})`; } else { content += `<br><em>Empty</em>`; } tooltip.innerHTML = content; const rect = event.currentTarget.getBoundingClientRect(); tooltip.style.left = `${rect.left + rect.width / 2 - tooltip.offsetWidth / 2}px`; tooltip.style.top = `${rect.top - tooltip.offsetHeight - 5}px`; tooltip.classList.remove('opacity-0'); };
    hideTooltip() { document.getElementById('tooltip').classList.add('opacity-0'); };
    _downloadFile(blob, filename) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); };
    showNotification(message, type = 'success') { const container = document.getElementById('notification-container'); const div = document.createElement('div'); const colors = { success: 'bg-teal-500', error: 'bg-red-500', warning: 'bg-amber-500', info: 'bg-sky-500' }; div.className = `toast-notification p-4 text-white rounded-lg shadow-xl ${colors[type]}`; div.textContent = message; container.appendChild(div); setTimeout(() => div.classList.add('show'), 10); setTimeout(() => { div.classList.remove('show'); div.addEventListener('transitionend', () => div.remove()); }, 3000); };
    showConfirmation(message, onConfirm) {
        const container = document.getElementById('modal-container');
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[1051]';
        modal.innerHTML = `<div class="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full mx-4"><p class="text-slate-700 mb-4">${message}</p><div class="flex justify-end gap-3"><button class="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold">Cancel</button><button class="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold">Confirm</button></div></div>`;
        container.appendChild(modal);
        modal.querySelector('button:first-of-type').onclick = () => modal.remove();
        modal.querySelector('button:last-of-type').onclick = () => { onConfirm(); modal.remove(); };
    };
    
    getGroupData(groupName) {
        const { layout, data } = this.state;
        const { values, activeTarget } = data;
        const wells = this.getWellList().filter(w => layout[w]?.group === groupName);
        const raw = wells.map(w => values[w]?.[activeTarget]).filter(v => v !== undefined);
        return { wells, raw };
    }
    
    generateConcentrationSeries() {
        const start = parseFloat(document.getElementById('conc-start').value);
        const factor = parseFloat(document.getElementById('conc-factor').value);
        const points = parseInt(document.getElementById('conc-points').value);
        if ([start, factor, points].some(isNaN)) return this.showNotification('Please fill all generator fields.', 'error');
        
        const series = [];
        let current = start;
        for(let i=0; i < points; i++) {
            series.push(current);
            current /= factor;
        }
        document.getElementById('dr-conc-input').value = series.map(s => Number(s.toPrecision(3))).join(',');
    }

    async analyzeDoseResponse() {
        const groupName = document.getElementById('dr-group-select').value;
        const concText = document.getElementById('dr-conc-input').value;
        if (!groupName || !concText) return this.showNotification('Please select a group and enter concentrations.', 'error');
        
        const concentrations = concText.split(',').map(c => parseFloat(c.trim())).filter(c => !isNaN(c));
        
        this.setState(s => {
            const group = s.groups.find(g => g.name === groupName);
            if (group) group.concentrations = concentrations;
        });
        
        const { raw: rawData } = this.getGroupData(groupName);
        const { avgBlank, range } = this.getAnalysisData();
        const replicates = Math.floor(rawData.length / concentrations.length);
        
        if (concentrations.length === 0 || rawData.length === 0 || replicates === 0 || concentrations.length * replicates !== rawData.length) {
            return this.showNotification(`Data mismatch: The number of data points (${rawData.length}) is not an even multiple of the number of concentrations (${concentrations.length}).`, 'error');
        }

        const normalizedData = rawData.map(v => range ? ((v - avgBlank) / range) * 100 : 0);
        
        const averagedData = [];
        for (let i = 0; i < concentrations.length; i++) {
            const repsSlice = normalizedData.slice(i * replicates, (i + 1) * replicates);
            const avg = repsSlice.reduce((a,b) => a + b, 0) / replicates;
            averagedData.push({ x: concentrations[i], y: avg });
        }

        const fit = await this.performFourPL(averagedData);

        document.getElementById('dr-result').innerHTML = `
            <span class="font-semibold">IC50/EC50:</span> <span class="font-bold text-teal-600">${fit.ic50.toPrecision(3)}</span> | 
            <span class="font-semibold">HillSlope:</span> <span class="font-bold">${fit.hillSlope.toFixed(2)}</span>`;
            
        this.plotDoseResponse(averagedData, fit);
    }
    
    plotDoseResponse(data, fit) {
        const ctx = document.getElementById('dose-response-chart').getContext('2d');
        if (this.doseResponseChart) this.doseResponseChart.destroy();
        
        const labels = data.map(p => p.x).filter(x => x > 0);
        if(labels.length === 0) return;
        
        const curvePoints = [];
        const minLogConc = Math.log10(Math.min(...labels));
        const maxLogConc = Math.log10(Math.max(...labels));
        
        if (isFinite(minLogConc) && isFinite(maxLogConc) && !isNaN(fit.ic50)) {
            for (let i = 0; i < 50; i++) {
                const logX = minLogConc + (maxLogConc - minLogConc) * (i / 49);
                const x = Math.pow(10, logX);
                const y = fit.bottom + (fit.top - fit.bottom) / (1 + Math.pow(x / fit.ic50, fit.hillSlope)); 
                curvePoints.push({x, y});
            }
        }

        this.doseResponseChart = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Avg. Normalized Data',
                    data: data,
                    backgroundColor: 'rgba(20, 184, 166, 0.8)',
                    type: 'scatter',
                    pointRadius: 5
                }, {
                    label: '4PL Curve Fit',
                    data: curvePoints,
                    borderColor: 'rgba(244, 63, 94, 0.8)',
                    type: 'line',
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0
                }]
            },
            options: {
                scales: {
                    x: { type: 'logarithmic', title: { display: true, text: 'Concentration' } },
                    y: { title: { display: true, text: 'Normalized Response (%)' } }
                }
            }
        });
    }
    exportChart() {
        const canvas = document.getElementById('dose-response-chart');
        if (!canvas || !this.doseResponseChart) return this.showNotification('No chart to export.', 'warning');
        const name = `${this.state.settings.expName || 'dose-response'}_chart.png`;
        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
}