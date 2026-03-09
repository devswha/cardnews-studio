function createSlides(definitions) {
  return definitions.map(function (definition, index) {
    return {
      slide: index + 1,
      layout: definition.layout,
      title: definition.title,
      subtitle: definition.subtitle || "",
      blocks: Array.isArray(definition.blocks) ? definition.blocks : [],
    };
  });
}

function createTemplate(id, label, description, definitions) {
  const slides = createSlides(definitions);
  return {
    id,
    label,
    description,
    slideCount: slides.length,
    spec: {
      meta: {
        title: slides[0].title,
        subtitle: slides[0].subtitle || description,
        total_slides: slides.length,
      },
      slides,
    },
  };
}

const TEMPLATE_PRESETS = [
  createTemplate(
    "basic-5",
    "Basic 5-Slide",
    "Cover → problem → solution → how-to → closing",
    [
      { layout: "cover", title: "New Card News", subtitle: "Start with the core message" },
      { layout: "problem", title: "What’s the problem?" },
      { layout: "solution", title: "What’s the solution?" },
      { layout: "howto", title: "How to apply it" },
      { layout: "closing", title: "Summary" },
    ]
  ),
  createTemplate(
    "tutorial-7",
    "Tutorial 7-Slide",
    "Cover → problem → solution → how-to → advanced → workflow → closing",
    [
      { layout: "cover", title: "Tutorial Card News", subtitle: "A fast guided walkthrough" },
      { layout: "problem", title: "Why this matters" },
      { layout: "solution", title: "Core approach" },
      { layout: "howto", title: "Step 1–3" },
      { layout: "advanced", title: "Advanced tips" },
      { layout: "workflow", title: "Recommended workflow" },
      { layout: "closing", title: "Next step" },
    ]
  ),
  createTemplate(
    "comparison",
    "Comparison",
    "Cover → problem → comparison → solution → closing",
    [
      { layout: "cover", title: "Comparison Card News", subtitle: "Compare two approaches quickly" },
      { layout: "problem", title: "What needs comparison?" },
      { layout: "comparison", title: "Side-by-side view" },
      { layout: "solution", title: "Recommended choice" },
      { layout: "closing", title: "Takeaway" },
    ]
  ),
  createTemplate(
    "quick-tip-3",
    "Quick Tip 3-Slide",
    "Cover → how-to → closing",
    [
      { layout: "cover", title: "Quick Tip", subtitle: "One fast idea to apply today" },
      { layout: "howto", title: "How to do it" },
      { layout: "closing", title: "Recap" },
    ]
  ),
];

module.exports = {
  TEMPLATE_PRESETS,
};
