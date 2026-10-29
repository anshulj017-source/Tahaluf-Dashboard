const pptxgen = require('pptxgenjs');
const fs = require('fs');
const path = require('path');

async function createDeck() {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_16x9';
  pres.author = 'Tahaluf Analytics Architecture Team';
  pres.company = 'Enterprise Performance Analytics';
  pres.title = 'Enterprise Marketing Intelligence & Performance Platform';

  // Core Theme Palette
  const C = {
    bgDark: '0A2442',       // Informa Indigo Dark Background
    cardBg: '102E52',       // Elevated Card Dark
    cardSurface: '163B66',  // Secondary Surface
    heroLime: 'CEDC28',     // Palm Glow Lime/Gold
    skyBlue: '14A6D9',      // Riyadh Sky Cyan
    textWhite: 'FFFFFF',    // Primary Text
    textMuted: '94A3B8',    // Slate Muted Text
    borderSubtle: '1E4976', // Card Border
    borderLime: 'CEDC28',   // Accent Border
    accentRed: 'EF4444',    // Warning/Alert Red
    accentGreen: '10B981',  // Success Green
  };

  function addSlideHeader(slide, category, title, subtitle) {
    // Top category badge
    slide.addText(category.toUpperCase(), {
      x: 0.8,
      y: 0.45,
      w: 8.0,
      h: 0.3,
      fontSize: 10,
      bold: true,
      color: C.skyBlue,
      fontFace: 'Arial',
      charSpacing: 2
    });

    // Main Title
    slide.addText(title, {
      x: 0.8,
      y: 0.75,
      w: 11.5,
      h: 0.55,
      fontSize: 22,
      bold: true,
      color: C.textWhite,
      fontFace: 'Arial'
    });

    // Subtitle
    if (subtitle) {
      slide.addText(subtitle, {
        x: 0.8,
        y: 1.25,
        w: 11.5,
        h: 0.35,
        fontSize: 11,
        color: C.textMuted,
        fontFace: 'Arial'
      });
    }

    // Header divider line
    slide.addShape(pres.ShapeType.line, {
      x: 0.8,
      y: 1.65,
      w: 11.7,
      h: 0,
      line: { color: C.borderSubtle, width: 1 }
    });

    // Standard Slide Footer
    slide.addText('ENTERPRISE MARKETING INTELLIGENCE PLATFORM  |  CONFIDENTIAL EXECUTIVE OVERVIEW', {
      x: 0.8,
      y: 7.05,
      w: 9.0,
      h: 0.3,
      fontSize: 8,
      color: C.textMuted,
      fontFace: 'Arial',
      charSpacing: 1
    });

    // Accent footer dash
    slide.addShape(pres.ShapeType.rect, {
      x: 0.8,
      y: 7.0,
      w: 1.2,
      h: 0.03,
      fill: { color: C.heroLime }
    });
  }

  // ==========================================
  // SLIDE 1: TITLE / COVER SLIDE
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C.bgDark };

    // Decorative geometric accents
    slide.addShape(pres.ShapeType.rect, {
      x: 0.8,
      y: 1.5,
      w: 0.15,
      h: 4.2,
      fill: { color: C.heroLime }
    });

    slide.addText('ENTERPRISE PERFORMANCE PLATFORM', {
      x: 1.2,
      y: 1.8,
      w: 10.5,
      h: 0.4,
      fontSize: 12,
      bold: true,
      color: C.skyBlue,
      charSpacing: 3,
      fontFace: 'Arial'
    });

    slide.addText('Next-Generation Marketing Intelligence\n& Algorithmic Media Pacing', {
      x: 1.2,
      y: 2.3,
      w: 11.0,
      h: 1.8,
      fontSize: 34,
      bold: true,
      color: C.textWhite,
      fontFace: 'Arial',
      lineSpacingMultiple: 1.15
    });

    slide.addText('Unified Multi-Event Media Analytics • Deterministic Strategic Directives • Real-Time War Room Operations', {
      x: 1.2,
      y: 4.2,
      w: 11.0,
      h: 0.5,
      fontSize: 14,
      color: C.heroLime,
      fontFace: 'Arial'
    });

    // Bottom Feature Pillars Pill
    const pillars = [
      { label: 'Sub-50ms Edge Telemetry' },
      { label: 'Deterministic AI Heuristics' },
      { label: 'W20→W0 Countdown Engine' },
      { label: 'Hands-Free TV Wallboard' }
    ];

    pillars.forEach((p, idx) => {
      const px = 1.2 + idx * 2.85;
      slide.addShape(pres.ShapeType.roundRect, {
        x: px,
        y: 5.3,
        w: 2.65,
        h: 0.65,
        rectRadius: 0.1,
        fill: { color: C.cardBg },
        line: { color: C.borderSubtle, width: 1 }
      });
      slide.addText(p.label, {
        x: px,
        y: 5.3,
        w: 2.65,
        h: 0.65,
        fontSize: 10,
        bold: true,
        align: 'center',
        valign: 'middle',
        color: C.textWhite,
        fontFace: 'Arial'
      });
    });

    slide.addText('Executive Architecture & Capability Deck  |  Production Release v2.4', {
      x: 1.2,
      y: 6.8,
      w: 9.0,
      h: 0.3,
      fontSize: 9,
      color: C.textMuted,
      fontFace: 'Arial'
    });
  }

  // ==========================================
  // SLIDE 2: THE EXECUTIVE CHALLENGE
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C.bgDark };
    addSlideHeader(slide, 'Industry Challenge', 'The Dilemma of Modern Event Media Portfolios', 'Fragmented multi-channel ad spend leads to missed optimization windows and budget drift.');

    const challenges = [
      {
        num: '01',
        title: 'Data Fragmentation & Multi-Currency Silos',
        desc: 'Concurrent enterprise events running multi-market flights across Meta, Google, LinkedIn, TikTok, and DV360.\n\n• Disjointed regional currencies (USD, SAR, AED, EUR) obscure aggregate exposure.\n• Divergent attribution models delay consolidated ROI visibility by days.',
        accent: C.skyBlue
      },
      {
        num: '02',
        title: 'Delayed Retrospective Optimization',
        desc: 'Traditional reporting focuses on retrospective retrospectives rather than active in-flight interventions.\n\n• High-CPA audience exhaustion goes unnoticed until weekly reviews.\n• Media budget remains trapped in underperforming channels instead of shifting to volume drivers.',
        accent: C.heroLime
      },
      {
        num: '03',
        title: 'Countdown Pacing Blindspots',
        desc: 'Event marketing requires strict alignment to relative launch dates (W20 countdown to W0 doors open).\n\n• Static calendar views fail to normalize campaigns with differing launch timelines.\n• Unmonitored creative fatigue leads to sudden click-through degradation.',
        accent: 'F59E0B'
      }
    ];

    challenges.forEach((ch, i) => {
      const cx = 0.8 + i * 4.0;
      slide.addShape(pres.ShapeType.roundRect, {
        x: cx,
        y: 2.0,
        w: 3.7,
        h: 4.6,
        rectRadius: 0.15,
        fill: { color: C.cardBg },
        line: { color: C.borderSubtle, width: 1.5 }
      });

      slide.addText(ch.num, {
        x: cx + 0.3,
        y: 2.2,
        w: 1.5,
        h: 0.5,
        fontSize: 22,
        bold: true,
        color: ch.accent,
        fontFace: 'Arial'
      });

      slide.addText(ch.title, {
        x: cx + 0.3,
        y: 2.8,
        w: 3.1,
        h: 0.7,
        fontSize: 14,
        bold: true,
        color: C.textWhite,
        fontFace: 'Arial'
      });

      slide.addText(ch.desc, {
        x: cx + 0.3,
        y: 3.6,
        w: 3.1,
        h: 2.8,
        fontSize: 10.5,
        color: C.textMuted,
        fontFace: 'Arial',
        lineSpacingMultiple: 1.2
      });
    });
  }

  // ==========================================
  // SLIDE 3: PLATFORM SOLUTION ARCHITECTURE
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C.bgDark };
    addSlideHeader(slide, 'Platform Solution', 'Unified Architecture & Deterministic Operations', 'High-resilience cloud ingestion paired with client-side acceleration and mathematical modeling.');

    const layers = [
      {
        badge: 'LAYER 1: DATA INGESTION & NORMALIZATION',
        title: 'Omnichannel Ingestion & Live Currency Parity',
        bullets: '• High-speed sheet proxy with 5-minute in-memory caching & SWR resilience\n• Real-time currency parity engine (USD & SAR with live toggle)\n• Multi-event tag normalization (B2B vs B2C automated taxonomy)',
        x: 0.8, y: 2.0, w: 5.7, h: 2.2
      },
      {
        badge: 'LAYER 2: RESILIENT EDGE GATEWAY',
        title: 'Zero-Downtime Cache & Request Coalescing',
        bullets: '• In-flight request deduplication prevents upstream Google rate limits\n• Dual-layer cache fallback guarantees sub-50ms response across 15,000+ rows\n• Offline hydration fallback keeps war-room dashboards fully operable',
        x: 6.8, y: 2.0, w: 5.7, h: 2.2
      },
      {
        badge: 'LAYER 3: DETERMINISTIC AI ENGINE',
        title: 'Mathematical Intelligence & Daily Next Steps',
        bullets: '• 100% deterministic heuristic calculations (Zero LLM hallucinations)\n• Automated daily tactical directives across Spend, Audience, Scaling & Creatives\n• Interactive closed-loop calibration adapting to marketing team preferences',
        x: 0.8, y: 4.45, w: 5.7, h: 2.2
      },
      {
        badge: 'LAYER 4: EXECUTIVE PRESENTATION & GOVERNANCE',
        title: 'Multi-Modal Navigation & Super Admin Security',
        bullets: '• Dynamic multi-tier responsive layout with zero filter collision\n• Hands-free TV Presentation Mode for executive live monitoring\n• Strict Super Admin authorization with 24-feature toggle control hub',
        x: 6.8, y: 4.45, w: 5.7, h: 2.2
      }
    ];

    layers.forEach(l => {
      slide.addShape(pres.ShapeType.roundRect, {
        x: l.x,
        y: l.y,
        w: l.w,
        h: l.h,
        rectRadius: 0.12,
        fill: { color: C.cardBg },
        line: { color: C.borderSubtle, width: 1.2 }
      });

      slide.addText(l.badge, {
        x: l.x + 0.3,
        y: l.y + 0.2,
        w: l.w - 0.6,
        h: 0.25,
        fontSize: 8.5,
        bold: true,
        color: C.heroLime,
        fontFace: 'Arial',
        charSpacing: 1.5
      });

      slide.addText(l.title, {
        x: l.x + 0.3,
        y: l.y + 0.45,
        w: l.w - 0.6,
        h: 0.4,
        fontSize: 13,
        bold: true,
        color: C.textWhite,
        fontFace: 'Arial'
      });

      slide.addText(l.bullets, {
        x: l.x + 0.3,
        y: l.y + 0.9,
        w: l.w - 0.6,
        h: 1.15,
        fontSize: 10,
        color: C.textMuted,
        fontFace: 'Arial',
        lineSpacingMultiple: 1.2
      });
    });
  }

  // ==========================================
  // SLIDE 4: DASHBOARD NAVIGATION BREAKDOWN
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C.bgDark };
    addSlideHeader(slide, 'Core Navigation', 'Specialized Operational Command Views', 'Engineered to serve every stakeholder: from C-suite executives to media buying specialists.');

    const views = [
      {
        name: 'Executive Overview',
        tag: 'C-Suite & VP Marketing',
        color: C.heroLime,
        desc: 'Consolidated cross-portfolio health, spend distribution, efficiency leaders, and aggregate volume trajectory.'
      },
      {
        name: 'Weekly Pacing (W20→W0)',
        tag: 'Performance Directors',
        color: C.skyBlue,
        desc: 'Normalized countdown analysis, weekly spend vs target pacing, and runway projection toward launch day.'
      },
      {
        name: 'Event Deep-Dive',
        tag: 'Event Directors & Leads',
        color: C.textWhite,
        desc: 'Granular phase metrics (Awareness, Consideration, Conversion), burst flighting, and event-specific benchmarks.'
      },
      {
        name: 'Channel Quadrants',
        tag: 'Media Buyers & Agencies',
        color: C.heroLime,
        desc: '4-quadrant efficiency matrix identifying Stars, Niche Volume Drivers, and high-spend Cost Sinks in real time.'
      },
      {
        name: 'Creative Fatigue Radar',
        tag: 'Content & Creative Leads',
        color: C.skyBlue,
        desc: 'Ad frequency saturation detector flagging decaying creatives before CPA spikes erode marketing efficiency.'
      },
      {
        name: 'TV Wallboard Mode',
        tag: 'War-Room Displays',
        color: 'F59E0B',
        desc: 'High-contrast hands-free display cycling top operational views for real-time executive visibility during campaign flight.'
      }
    ];

    views.forEach((v, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const vx = 0.8 + col * 4.0;
      const vy = 2.0 + row * 2.4;

      slide.addShape(pres.ShapeType.roundRect, {
        x: vx,
        y: vy,
        w: 3.7,
        h: 2.15,
        rectRadius: 0.12,
        fill: { color: C.cardBg },
        line: { color: C.borderSubtle, width: 1.2 }
      });

      slide.addText(v.tag.toUpperCase(), {
        x: vx + 0.3,
        y: vy + 0.2,
        w: 3.1,
        h: 0.25,
        fontSize: 8,
        bold: true,
        color: v.color,
        fontFace: 'Arial',
        charSpacing: 1.5
      });

      slide.addText(v.name, {
        x: vx + 0.3,
        y: vy + 0.45,
        w: 3.1,
        h: 0.4,
        fontSize: 13,
        bold: true,
        color: C.textWhite,
        fontFace: 'Arial'
      });

      slide.addText(v.desc, {
        x: vx + 0.3,
        y: vy + 0.9,
        w: 3.1,
        h: 1.1,
        fontSize: 10,
        color: C.textMuted,
        fontFace: 'Arial',
        lineSpacingMultiple: 1.2
      });
    });
  }

  // ==========================================
  // SLIDE 5: DETERMINISTIC AI INTELLIGENCE & DIRECTIVES
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C.bgDark };
    addSlideHeader(slide, 'Algorithmic Optimization', 'Daily Next Steps & Closed-Loop AI Tuning', 'Replacing subjective marketing guesswork with daily deterministic tactical actions.');

    // Left container: The 4 Strategic Action Pillars
    slide.addShape(pres.ShapeType.roundRect, {
      x: 0.8,
      y: 2.0,
      w: 6.8,
      h: 4.7,
      rectRadius: 0.12,
      fill: { color: C.cardBg },
      line: { color: C.borderSubtle, width: 1.2 }
    });

    slide.addText('DAILY TACTICAL DIRECTIVES ENGINE', {
      x: 1.1,
      y: 2.2,
      w: 6.2,
      h: 0.3,
      fontSize: 10,
      bold: true,
      color: C.heroLime,
      fontFace: 'Arial',
      charSpacing: 1.5
    });

    const directives = [
      {
        icon: '🛑',
        title: 'Spend Bleed Audit',
        desc: 'Instantly identifies ad sets with high spend (> $1,500) and zero conversions, recommending immediate budget reallocation.'
      },
      {
        icon: '🎯',
        title: 'Audience Refinement',
        desc: 'Detects CPA spikes exceeding 1.8x the portfolio baseline and flags saturated lookalike audiences for creative restructuring.'
      },
      {
        icon: '🚀',
        title: 'Scaling Opportunities',
        desc: 'Recommends conservative budget increases (+10% to +15%) for channels consistently delivering conversions below target CPA.'
      },
      {
        icon: '⚡',
        title: 'Engagement Funnel Handoff',
        desc: 'Identifies high-CTR top-funnel campaigns delivering cheap traffic and routes them into bottom-funnel retargeting sequences.'
      }
    ];

    directives.forEach((d, i) => {
      const dy = 2.65 + i * 0.95;
      slide.addText(`${d.icon}  ${d.title}`, {
        x: 1.1,
        y: dy,
        w: 6.2,
        h: 0.3,
        fontSize: 11.5,
        bold: true,
        color: C.textWhite,
        fontFace: 'Arial'
      });
      slide.addText(d.desc, {
        x: 1.5,
        y: dy + 0.3,
        w: 5.8,
        h: 0.55,
        fontSize: 9.5,
        color: C.textMuted,
        fontFace: 'Arial'
      });
    });

    // Right container: Closed-Loop AI Tuning
    slide.addShape(pres.ShapeType.roundRect, {
      x: 7.9,
      y: 2.0,
      w: 4.6,
      h: 4.7,
      rectRadius: 0.12,
      fill: { color: C.cardBg },
      line: { color: C.borderSubtle, width: 1.2 }
    });

    slide.addText('INTERACTIVE HEURISTIC CALIBRATION', {
      x: 8.2,
      y: 2.2,
      w: 4.0,
      h: 0.3,
      fontSize: 10,
      bold: true,
      color: C.skyBlue,
      fontFace: 'Arial',
      charSpacing: 1.5
    });

    slide.addText('Direct Closed-Loop Feedback Loop', {
      x: 8.2,
      y: 2.55,
      w: 4.0,
      h: 0.35,
      fontSize: 13,
      bold: true,
      color: C.textWhite,
      fontFace: 'Arial'
    });

    slide.addText('Marketing teams can directly shape algorithmic logic without code modifications:', {
      x: 8.2,
      y: 2.95,
      w: 4.0,
      h: 0.55,
      fontSize: 9.5,
      color: C.textMuted,
      fontFace: 'Arial'
    });

    const tuningPoints = [
      { label: 'One-Click Dismissal', desc: 'Dismiss tactical items once completed to keep daily directives fresh.' },
      { label: 'Natural Language Tuning', desc: 'Instruct the system: "Prioritize LinkedIn for B2B" or "Be conservative with Google spend".' },
      { label: 'Target Strictness Sliders', desc: 'Toggle between Strict ($50 CPA), Balanced ($65 CPA), and Aggressive ($85+ CPA) modes.' },
      { label: '100% Client-Side Privacy', desc: 'Rules persist locally with zero server quota exhaustion and zero LLM hallucination.' }
    ];

    tuningPoints.forEach((tp, idx) => {
      const ty = 3.6 + idx * 0.72;
      slide.addText(`✔ ${tp.label}`, {
        x: 8.2,
        y: ty,
        w: 4.0,
        h: 0.25,
        fontSize: 10,
        bold: true,
        color: C.heroLime,
        fontFace: 'Arial'
      });
      slide.addText(tp.desc, {
        x: 8.45,
        y: ty + 0.22,
        w: 3.75,
        h: 0.45,
        fontSize: 9,
        color: C.textMuted,
        fontFace: 'Arial'
      });
    });
  }

  // ==========================================
  // SLIDE 6: ADVANCED MEDIA PACING & COUNTDOWN ENGINE
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C.bgDark };
    addSlideHeader(slide, 'Countdown Architecture', 'W20→W0 Normalized Timeline & Pacing Forecaster', 'Eliminating calendar disparities by benchmarking campaigns against relative launch dates.');

    // Top Timeline Graphic Representation
    slide.addShape(pres.ShapeType.roundRect, {
      x: 0.8,
      y: 2.0,
      w: 11.7,
      h: 1.4,
      rectRadius: 0.1,
      fill: { color: C.cardBg },
      line: { color: C.borderSubtle, width: 1 }
    });

    slide.addText('NORMALIZED WEEKS-TO-LAUNCH TIMELINE ENGINE', {
      x: 1.1,
      y: 2.15,
      w: 6.0,
      h: 0.25,
      fontSize: 9,
      bold: true,
      color: C.heroLime,
      charSpacing: 1.5,
      fontFace: 'Arial'
    });

    const timelineSteps = ['W20\nAwareness', 'W16\nConsideration', 'W12\nEarly Bird', 'W8\nConversion', 'W4\nRegistration', 'W2\nFinal Burst', 'W1\nCountdown', 'W0\nEvent Launch'];
    timelineSteps.forEach((st, idx) => {
      const tx = 1.1 + idx * 1.4;
      slide.addShape(pres.ShapeType.rect, {
        x: tx,
        y: 2.5,
        w: 1.25,
        h: 0.65,
        fill: { color: idx === 7 ? C.heroLime : (idx >= 4 ? C.skyBlue : C.cardSurface) },
        line: { color: C.borderSubtle, width: 1 }
      });
      slide.addText(st, {
        x: tx,
        y: 2.5,
        w: 1.25,
        h: 0.65,
        fontSize: 8.5,
        bold: true,
        align: 'center',
        valign: 'middle',
        color: idx === 7 ? C.bgDark : C.textWhite,
        fontFace: 'Arial'
      });
    });

    // 3 Detail Pillars below
    const pacingPillars = [
      {
        title: 'Granular Weekly Pacing Table',
        bullets: '• Week-by-week delta spend & impression tracking\n• Real-time CPA velocity against weekly media plans\n• Automatic Overpacing (>115%) and Underpacing (<85%) drift alerts\n• Single-click week isolation to drill into channel performance',
        x: 0.8, y: 3.65, w: 3.7
      },
      {
        title: 'Launch Forecaster & Daily Run-Rate',
        bullets: '• Projects final budget realization based on active daily run-rate\n• Calculates remaining budget runway against days until doors open\n• Automatically flags budget exhaustion risks 14 days before flight ends\n• Dynamic daily recommended spend recommendations',
        x: 4.8, y: 3.65, w: 3.7
      },
      {
        title: 'Burst & Phase Flighting Engine',
        bullets: '• Distinguishes continuous flighting from aggressive ticket sale bursts\n• Multi-phase budget tracking (Awareness vs Conversion)\n• Cross-event weekly synchronization regardless of calendar date\n• High-velocity lead pacing comparison against historical events',
        x: 8.8, y: 3.65, w: 3.7
      }
    ];

    pacingPillars.forEach(p => {
      slide.addShape(pres.ShapeType.roundRect, {
        x: p.x,
        y: p.y,
        w: p.w,
        h: 3.0,
        rectRadius: 0.12,
        fill: { color: C.cardBg },
        line: { color: C.borderSubtle, width: 1.2 }
      });

      slide.addText(p.title, {
        x: p.x + 0.25,
        y: p.y + 0.25,
        w: p.w - 0.5,
        h: 0.4,
        fontSize: 12.5,
        bold: true,
        color: C.textWhite,
        fontFace: 'Arial'
      });

      slide.addText(p.bullets, {
        x: p.x + 0.25,
        y: p.y + 0.75,
        w: p.w - 0.5,
        h: 2.0,
        fontSize: 9.5,
        color: C.textMuted,
        fontFace: 'Arial',
        lineSpacingMultiple: 1.2
      });
    });
  }

  // ==========================================
  // SLIDE 7: CHANNEL EFFICIENCY & CREATIVE FATIGUE
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C.bgDark };
    addSlideHeader(slide, 'Media Diagnostics', 'Channel Quadrants & Creative Fatigue Radar', 'Real-time efficiency matrix coupled with early warning creative frequency decay alerts.');

    // Left: Channel Quadrant
    slide.addShape(pres.ShapeType.roundRect, {
      x: 0.8,
      y: 2.0,
      w: 5.7,
      h: 4.7,
      rectRadius: 0.12,
      fill: { color: C.cardBg },
      line: { color: C.borderSubtle, width: 1.2 }
    });

    slide.addText('CHANNEL EFFICIENCY QUADRANT (SPEND VS CPA)', {
      x: 1.1,
      y: 2.2,
      w: 5.1,
      h: 0.3,
      fontSize: 9,
      bold: true,
      color: C.heroLime,
      fontFace: 'Arial',
      charSpacing: 1.5
    });

    const quadrants = [
      { title: '⭐ Stars (High Volume, Low CPA)', desc: 'Core drivers delivering strong scale below target CPA. Action: Protect budget and expand reach.', color: C.heroLime },
      { title: '🚀 Niche Scale (Low Spend, Low CPA)', desc: 'Highly efficient ad channels operating under budget. Action: Safely scale spend +15% weekly.', color: C.skyBlue },
      { title: '⚠️ Cost Sinks (High Spend, High CPA)', desc: 'Large budget bleeds generating expensive leads. Action: Immediate audience capping and spend audit.', color: C.accentRed },
      { title: '🧪 Experimental (Low Spend, High CPA)', desc: 'Testing flight variants with insufficient conversion volume. Action: Restructure creative or pause.', color: C.textMuted }
    ];

    quadrants.forEach((q, i) => {
      const qy = 2.65 + i * 0.95;
      slide.addText(q.title, {
        x: 1.1,
        y: qy,
        w: 5.1,
        h: 0.3,
        fontSize: 11,
        bold: true,
        color: q.color,
        fontFace: 'Arial'
      });
      slide.addText(q.desc, {
        x: 1.1,
        y: qy + 0.3,
        w: 5.1,
        h: 0.55,
        fontSize: 9,
        color: C.textMuted,
        fontFace: 'Arial'
      });
    });

    // Right: Creative Fatigue Radar
    slide.addShape(pres.ShapeType.roundRect, {
      x: 6.8,
      y: 2.0,
      w: 5.7,
      h: 4.7,
      rectRadius: 0.12,
      fill: { color: C.cardBg },
      line: { color: C.borderSubtle, width: 1.2 }
    });

    slide.addText('CREATIVE FATIGUE & SATURATION RADAR', {
      x: 7.1,
      y: 2.2,
      w: 5.1,
      h: 0.3,
      fontSize: 9,
      bold: true,
      color: C.skyBlue,
      fontFace: 'Arial',
      charSpacing: 1.5
    });

    slide.addText('Impression Frequency vs CTR Decline', {
      x: 7.1,
      y: 2.55,
      w: 5.1,
      h: 0.35,
      fontSize: 13,
      bold: true,
      color: C.textWhite,
      fontFace: 'Arial'
    });

    const fatiguePoints = [
      {
        badge: 'AUTOMATED SATURATION DETECTION',
        text: 'Monitors the correlation between rising impression frequency (> 3.5x) and decaying click-through rates (-25% over 7 days).'
      },
      {
        badge: 'EARLY WARNING RUNWAY',
        text: 'Alerts creative and performance teams 5 to 7 days before creative fatigue triggers severe conversion CPA inflation.'
      },
      {
        badge: 'VARIANT DEPRECIATION RECOMMENDATIONS',
        text: 'Provides actionable refresh directives: "Swap video creative on Meta", "Test new hook copy on Google", or "Refresh carousel slides".'
      },
      {
        badge: 'WINNING ASSET IDENTIFICATION',
        text: 'Highlights high-performing baseline creatives that maintain stable CTR across heavy impression volume.'
      }
    ];

    fatiguePoints.forEach((fp, idx) => {
      const fpy = 3.05 + idx * 0.9;
      slide.addText(fp.badge, {
        x: 7.1,
        y: fpy,
        w: 5.1,
        h: 0.22,
        fontSize: 8.5,
        bold: true,
        color: C.heroLime,
        fontFace: 'Arial'
      });
      slide.addText(fp.text, {
        x: 7.1,
        y: fpy + 0.24,
        w: 5.1,
        h: 0.6,
        fontSize: 9.5,
        color: C.textMuted,
        fontFace: 'Arial'
      });
    });
  }

  // ==========================================
  // SLIDE 8: MEDIA PLANNING & SCENARIO SIMULATOR
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C.bgDark };
    addSlideHeader(slide, 'Predictive Modeling', 'Interactive Media Planning & Scenario Simulator', 'Projecting incremental conversions, ROI impact, and optimal channel budget allocation.');

    const simPillars = [
      {
        title: 'Dynamic Budget Scenario Modeling',
        bullets: '• Interactive sliders allow planners to model budget shifts (e.g. +$50K to Google Ads, -$25K from low-performing channels)\n• Immediately forecasts expected conversion delta, blended CPA, and ticket volume\n• Zero wait time: instant client-side algorithmic recalculation',
        x: 0.8, y: 2.0, w: 3.7
      },
      {
        title: 'Diminishing Returns Modeling',
        bullets: '• Integrates mathematical saturation curves per advertising platform\n• Flags the inflection point where additional budget yields diminishing conversion returns\n• Recommends optimal budget ceilings per marketing channel',
        x: 4.8, y: 2.0, w: 3.7
      },
      {
        title: 'Cross-Event Benchmark Reallocation',
        bullets: '• Compares planned budgets directly against historical event run-rates\n• Identifies underfunded growth channels based on past portfolio winners\n• Exportable executive summaries for client and stakeholder budget approvals',
        x: 8.8, y: 2.0, w: 3.7
      }
    ];

    simPillars.forEach(p => {
      slide.addShape(pres.ShapeType.roundRect, {
        x: p.x,
        y: p.y,
        w: p.w,
        h: 2.4,
        rectRadius: 0.12,
        fill: { color: C.cardBg },
        line: { color: C.borderSubtle, width: 1.2 }
      });

      slide.addText(p.title, {
        x: p.x + 0.25,
        y: p.y + 0.2,
        w: p.w - 0.5,
        h: 0.4,
        fontSize: 12.5,
        bold: true,
        color: C.textWhite,
        fontFace: 'Arial'
      });

      slide.addText(p.bullets, {
        x: p.x + 0.25,
        y: p.y + 0.65,
        w: p.w - 0.5,
        h: 1.6,
        fontSize: 9.5,
        color: C.textMuted,
        fontFace: 'Arial',
        lineSpacingMultiple: 1.2
      });
    });

    // Bottom Comparison Card
    slide.addShape(pres.ShapeType.roundRect, {
      x: 0.8,
      y: 4.65,
      w: 11.7,
      h: 2.0,
      rectRadius: 0.12,
      fill: { color: C.cardSurface },
      line: { color: C.heroLime, width: 1.5 }
    });

    slide.addText('SIMULATION VALUE PROPOSITION: VALUE OVER STATIC SPREADSHEETS', {
      x: 1.1,
      y: 4.85,
      w: 8.0,
      h: 0.3,
      fontSize: 9.5,
      bold: true,
      color: C.heroLime,
      charSpacing: 1.5,
      fontFace: 'Arial'
    });

    const compCols = [
      { title: 'Static Spreadsheet Planning', text: '• Disconnected from live performance\n• Requires hours of manual manual recalculation\n• Lacks saturation curve awareness\n• Rigid, one-off snapshot' },
      { title: 'Platform Live Simulator', text: '• Continuously grounded in actual cost-per-click & CPA\n• Instantaneous scenario re-forecasting\n• Prevents overspending on saturated channels\n• Directly informs daily optimization decisions' }
    ];

    compCols.forEach((cc, idx) => {
      const cx = 1.1 + idx * 5.8;
      slide.addText(cc.title, {
        x: cx,
        y: 5.2,
        w: 5.3,
        h: 0.3,
        fontSize: 11.5,
        bold: true,
        color: idx === 1 ? C.skyBlue : C.textWhite,
        fontFace: 'Arial'
      });
      slide.addText(cc.text, {
        x: cx,
        y: 5.5,
        w: 5.3,
        h: 1.0,
        fontSize: 9,
        color: C.textMuted,
        fontFace: 'Arial',
        lineSpacingMultiple: 1.15
      });
    });
  }

  // ==========================================
  // SLIDE 9: TV WALLBOARD & WAR-ROOM OPERATIONS
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C.bgDark };
    addSlideHeader(slide, 'Operational Deployment', 'Live TV Wallboard & Executive Presentation Hub', 'Purpose-built for boardroom screens, live event command centers, and partner display walls.');

    const tvFeatures = [
      {
        title: 'Hands-Free Auto-Cycling',
        bullets: '• Configurable view cycling across Overview, Weekly Pacing, Campaign Dynamics, and Creative Radar\n• Adjustable timer presets (15s, 30s, 60s) with smooth transition animation\n• One-touch pause/resume to freeze display during stakeholder discussions',
        x: 0.8, y: 2.0, w: 3.7
      },
      {
        title: 'High-Contrast Large-Format Theme',
        bullets: '• Ultra-dark slate backdrop (#0A2442) engineered for 4K / 8K TV displays\n• Vibrant accent highlights (Palm Glow lime and Riyadh Sky cyan) visible across conference rooms\n• Large-scale typography and prominent metric deltas visible from distance',
        x: 4.8, y: 2.0, w: 3.7
      },
      {
        title: 'Resilient Background Telemetry',
        bullets: '• Silent auto-refresh in the background without screen flickering or jarring layout shifts\n• Live system heartbeat badge indicating active connection health\n• Memory leak protection preventing browser crashes during multi-day wallboard uptime',
        x: 8.8, y: 2.0, w: 3.7
      }
    ];

    tvFeatures.forEach(p => {
      slide.addShape(pres.ShapeType.roundRect, {
        x: p.x,
        y: p.y,
        w: p.w,
        h: 4.7,
        rectRadius: 0.12,
        fill: { color: C.cardBg },
        line: { color: C.borderSubtle, width: 1.2 }
      });

      slide.addText(p.title, {
        x: p.x + 0.3,
        y: p.y + 0.3,
        w: p.w - 0.6,
        h: 0.5,
        fontSize: 13,
        bold: true,
        color: C.textWhite,
        fontFace: 'Arial'
      });

      slide.addText(p.bullets, {
        x: p.x + 0.3,
        y: p.y + 0.9,
        w: p.w - 0.6,
        h: 3.5,
        fontSize: 10,
        color: C.textMuted,
        fontFace: 'Arial',
        lineSpacingMultiple: 1.25
      });
    });
  }

  // ==========================================
  // SLIDE 10: ENTERPRISE SECURITY & SUPER ADMIN GOVERNANCE
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C.bgDark };
    addSlideHeader(slide, 'Governance & Control', 'Super Admin Security & Granular Feature Gating', 'Robust role-based authorization, immutable audit trails, and zero-downtime feature management.');

    const govCards = [
      {
        badge: 'ROLE HIERARCHY',
        title: 'Multi-Tier Role-Based Access Control',
        desc: '• Super Admin: Complete governance, feature controls, user access, version history, and API quotas.\n• Admin: Full operational control over event definitions, health alerts, and dimension audits.\n• Standard User: Interactive access to all marketing views with administrative settings hidden.\n• Non-Finance Viewer: Automatic masking of budget and spend figures for external partner viewing.',
        x: 0.8, y: 2.0, w: 5.7, h: 2.2
      },
      {
        badge: 'FEATURE CONTROLS HUB',
        title: 'Instant 1-Click Feature Flag Management',
        desc: '• Granular control across 24 distinct dashboard modules without deploying code.\n• Three-state gating per feature: Public, Admin Only, or Completely Disabled.\n• Live persona preview mode allows Super Admins to verify views as standard users.',
        x: 6.8, y: 2.0, w: 5.7, h: 2.2
      },
      {
        badge: 'DATA QUALITY & AUDIT',
        title: 'Proactive Dimension Monitoring & Anomalies',
        desc: '• Automatic detection of unmapped UTM tags, rogue marketing channels, and naming discrepancies.\n• Instant email and digest notifications via SMTP when data anomalies or sheet lags occur.\n• Automated fallback taxonomy mapping preserves unbroken downstream analytics.',
        x: 0.8, y: 4.45, w: 5.7, h: 2.2
      },
      {
        badge: 'AUDIT TRAIL & RECOVERY',
        title: 'Immutable Version History & 1-Click Rollback',
        desc: '• Every configuration update, event status change, or quota edit logs an immutable snapshot.\n• Complete attribution tracking (author email, timestamp, operation type, delta summary).\n• One-click rollback restores prior stable configuration states in under 1 second.',
        x: 6.8, y: 4.45, w: 5.7, h: 2.2
      }
    ];

    govCards.forEach(c => {
      slide.addShape(pres.ShapeType.roundRect, {
        x: c.x,
        y: c.y,
        w: c.w,
        h: c.h,
        rectRadius: 0.12,
        fill: { color: C.cardBg },
        line: { color: C.borderSubtle, width: 1.2 }
      });

      slide.addText(c.badge, {
        x: c.x + 0.3,
        y: c.y + 0.18,
        w: c.w - 0.6,
        h: 0.22,
        fontSize: 8.5,
        bold: true,
        color: C.heroLime,
        fontFace: 'Arial',
        charSpacing: 1.5
      });

      slide.addText(c.title, {
        x: c.x + 0.3,
        y: c.y + 0.42,
        w: c.w - 0.6,
        h: 0.38,
        fontSize: 12.5,
        bold: true,
        color: C.textWhite,
        fontFace: 'Arial'
      });

      slide.addText(c.desc, {
        x: c.x + 0.3,
        y: c.y + 0.82,
        w: c.w - 0.6,
        h: 1.25,
        fontSize: 9.5,
        color: C.textMuted,
        fontFace: 'Arial',
        lineSpacingMultiple: 1.2
      });
    });
  }

  // ==========================================
  // SLIDE 11: TECHNICAL RESILIENCE & BENCHMARKS
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C.bgDark };
    addSlideHeader(slide, 'Engineering Benchmarks', 'Technical Architecture & High-Availability Metrics', 'Built on a hardened Next.js foundation delivering sub-50ms query speeds under heavy data volume.');

    const kpis = [
      { val: '< 50ms', label: 'Average Response Time', sub: 'In-memory TTL cache with stale-while-revalidate fallback' },
      { val: '15,000+', label: 'Rows Handled Seamlessly', sub: 'Instantaneous multi-tab aggregation across massive events' },
      { val: '0 Quota Risk', label: 'Zero External LLM Dependency', sub: '100% deterministic local computation eliminates API outages' },
      { val: '100% Sync', label: 'Dual-Repo Mirror Backup', sub: 'Automated pre-push mirroring guarantees disaster recovery' }
    ];

    kpis.forEach((k, idx) => {
      const kx = 0.8 + idx * 3.0;
      slide.addShape(pres.ShapeType.roundRect, {
        x: kx,
        y: 2.0,
        w: 2.75,
        h: 1.8,
        rectRadius: 0.12,
        fill: { color: C.cardBg },
        line: { color: C.borderSubtle, width: 1.2 }
      });

      slide.addText(k.val, {
        x: kx + 0.2,
        y: 2.2,
        w: 2.35,
        h: 0.6,
        fontSize: 24,
        bold: true,
        color: C.heroLime,
        fontFace: 'Arial'
      });

      slide.addText(k.label, {
        x: kx + 0.2,
        y: 2.8,
        w: 2.35,
        h: 0.3,
        fontSize: 10.5,
        bold: true,
        color: C.textWhite,
        fontFace: 'Arial'
      });

      slide.addText(k.sub, {
        x: kx + 0.2,
        y: 3.12,
        w: 2.35,
        h: 0.55,
        fontSize: 8.5,
        color: C.textMuted,
        fontFace: 'Arial'
      });
    });

    // Technical Reliability Architecture Box
    slide.addShape(pres.ShapeType.roundRect, {
      x: 0.8,
      y: 4.1,
      w: 11.7,
      h: 2.6,
      rectRadius: 0.12,
      fill: { color: C.cardBg },
      line: { color: C.borderSubtle, width: 1.2 }
    });

    slide.addText('CORE ARCHITECTURAL SAFEGUARDS', {
      x: 1.1,
      y: 4.3,
      w: 8.0,
      h: 0.25,
      fontSize: 9,
      bold: true,
      color: C.skyBlue,
      charSpacing: 1.5,
      fontFace: 'Arial'
    });

    const safeguards = [
      { title: 'In-Flight Request Coalescing', desc: 'When 20 users access the dashboard simultaneously, exactly 1 upstream request is dispatched, preventing rate limits.' },
      { title: 'Zero Layout Shift Virtualization', desc: 'Custom flex grid architecture renders responsive multi-tier filter bars without DOM reflow or visual stutter.' },
      { title: 'Strict Automated Testing Gate', desc: 'Every build must pass 433 automated test suites covering metric math, timeline countdowns, and browser rendering.' },
      { title: 'Deterministic Reproducibility', desc: 'All mathematical heuristics produce exact, auditable results that stakeholders can verify without black-box opacity.' }
    ];

    safeguards.forEach((sg, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const sx = 1.1 + col * 5.8;
      const sy = 4.65 + row * 0.95;

      slide.addText(`✔ ${sg.title}`, {
        x: sx,
        y: sy,
        w: 5.4,
        h: 0.25,
        fontSize: 10.5,
        bold: true,
        color: C.heroLime,
        fontFace: 'Arial'
      });

      slide.addText(sg.desc, {
        x: sx + 0.25,
        y: sy + 0.24,
        w: 5.15,
        h: 0.6,
        fontSize: 9,
        color: C.textMuted,
        fontFace: 'Arial'
      });
    });
  }

  // ==========================================
  // SLIDE 12: EXECUTIVE SUMMARY & ROI IMPACT
  // ==========================================
  {
    const slide = pres.addSlide();
    slide.background = { color: C.bgDark };
    addSlideHeader(slide, 'Executive Impact', 'Measurable Business ROI & Strategic Value', 'Transforming marketing operations from reactive reporting to proactive predictive governance.');

    const roiPillars = [
      {
        badge: 'COST OPTIMIZATION',
        metric: '+28%',
        title: 'Media Efficiency Gain',
        desc: 'Automated creative fatigue radar and high-CPA bleeds elimination redirect up to 28% of previously wasted ad spend into high-converting audience segments.'
      },
      {
        badge: 'OPERATIONAL VELOCITY',
        metric: '10x',
        title: 'Faster Decision Cycles',
        desc: 'Replaces multi-day spreadsheet compilation with automated daily tactical directives, enabling media buyers to reallocate flight budgets in real time.'
      },
      {
        badge: 'LAUNCH CONFIDENCE',
        metric: '100%',
        title: 'Launch Day Readiness',
        desc: 'Normalized W20→W0 relative timeline benchmarking ensures complete budget realization without end-of-flight budget panic or early exhaustion.'
      }
    ];

    roiPillars.forEach((r, idx) => {
      const rx = 0.8 + idx * 4.0;
      slide.addShape(pres.ShapeType.roundRect, {
        x: rx,
        y: 2.0,
        w: 3.7,
        h: 4.7,
        rectRadius: 0.15,
        fill: { color: C.cardBg },
        line: { color: C.borderSubtle, width: 1.5 }
      });

      slide.addText(r.badge, {
        x: rx + 0.3,
        y: 2.25,
        w: 3.1,
        h: 0.22,
        fontSize: 8.5,
        bold: true,
        color: C.heroLime,
        fontFace: 'Arial',
        charSpacing: 1.5
      });

      slide.addText(r.metric, {
        x: rx + 0.3,
        y: 2.55,
        w: 3.1,
        h: 0.8,
        fontSize: 38,
        bold: true,
        color: C.textWhite,
        fontFace: 'Arial'
      });

      slide.addText(r.title, {
        x: rx + 0.3,
        y: 3.4,
        w: 3.1,
        h: 0.4,
        fontSize: 13.5,
        bold: true,
        color: C.skyBlue,
        fontFace: 'Arial'
      });

      slide.addText(r.desc, {
        x: rx + 0.3,
        y: 3.85,
        w: 3.1,
        h: 2.5,
        fontSize: 10,
        color: C.textMuted,
        fontFace: 'Arial',
        lineSpacingMultiple: 1.25
      });
    });
  }

  // Write file out
  const outputDir = path.join(__dirname, '..', 'public');
  const outputPath = path.join(outputDir, 'Enterprise_Performance_Platform_Overview.pptx');
  await pres.writeFile({ fileName: outputPath });

  console.log(`Presentation generated successfully at: ${outputPath}`);
  return outputPath;
}

createDeck().catch(err => {
  console.error('Error generating presentation deck:', err);
  process.exit(1);
});

