export type Lesson = {
  id: string;
  crop: string;
  title: string;
  summary: string;
  durationMinutes: number;
  level: string;
  sections: { heading: string; body: string }[];
  quiz: {
    question: string;
    options: string[];
    answerIndex: number;
    explanation: string;
  };
  sourceTitle: string;
  sourceUrl: string;
  reviewStatus: "draft" | "reviewed";
};
const source = {
  sourceTitle: "Uganda MAAIF farmer extension guides",
  sourceUrl: "https://www.agriculture.go.ug/acdp-farmer-guides/",
  reviewStatus: "draft" as const,
};
export const lessons: Lesson[] = [
  {
    id: "maize-season",
    crop: "Maize",
    title: "Plan your maize season",
    summary:
      "Choose a suitable variety, check your field, and make a practical planting plan.",
    durationMinutes: 6,
    level: "Getting started",
    ...source,
    sections: [
      {
        heading: "Start with your field",
        body: "Record your district, field size, previous crop, drainage and access to water. Ask a local extension officer which maize varieties suit your location and intended market. This draft guide needs local agronomist review before being used as a planting prescription.",
      },
      {
        heading: "Use the forecast carefully",
        body: "Check the latest district forecast and its issue date. A chance of rain is not a guarantee of enough soil moisture. Confirm local soil conditions and extension guidance before planting. Keep a record of the planting date and seed source.",
      },
      {
        heading: "Make time for scouting",
        body: "Walk the field regularly and record changes in leaves, plant growth and insects. A photograph can help an extension officer review a concern. Do not choose a pesticide from an unconfirmed photograph or a weather alert alone.",
      },
    ],
    quiz: {
      question:
        "What should you check before using a forecast to plan planting?",
      options: [
        "Only the predicted market price",
        "Forecast date, local soil moisture, and extension guidance",
        "The number of people growing maize",
      ],
      answerIndex: 1,
      explanation:
        "Forecasts support a decision; local field conditions and suitable crop guidance still matter.",
    },
  },
  {
    id: "beans-scouting",
    crop: "Beans",
    title: "Spot changes in your bean crop",
    summary:
      "Build a simple scouting habit and know what to share with an extension officer.",
    durationMinutes: 5,
    level: "Field practice",
    ...source,
    sections: [
      {
        heading: "Keep observations consistent",
        body: "Visit several parts of the field rather than inspecting only the edge. Note the crop stage and whether the problem affects a few plants or a wider area. Record when you first saw the change.",
      },
      {
        heading: "Describe, do not diagnose",
        body: "Write down what you see: leaf colour, spots, wilting, insects or damaged pods. Several causes can look similar. Attach a clear photograph when connection allows and ask an extension officer to review it.",
      },
      {
        heading: "Protect people and the harvest",
        body: "Treatment decisions require local advice and an approved product label where relevant. Never mix products or guess a dosage. This draft lesson is an observation guide, not a treatment recommendation.",
      },
    ],
    quiz: {
      question: "Which report is most useful for an extension officer?",
      options: [
        "A guessed disease name only",
        "An instruction to spray everything",
        "Crop stage, symptoms, affected area, and first observation date",
      ],
      answerIndex: 2,
      explanation:
        "Clear observations help a qualified reviewer decide the next step.",
    },
  },
  {
    id: "coffee-records",
    crop: "Coffee",
    title: "Keep useful coffee farm records",
    summary:
      "Track work, quality observations and sales so your next decision has evidence.",
    durationMinutes: 5,
    level: "Getting started",
    sourceTitle: "NARO agricultural production manuals",
    sourceUrl:
      "https://researchspace.naro.go.ug/communities/d6d6f082-855d-4a06-8351-f6a0cbf7fca7/subcoms-cols",
    reviewStatus: "draft",
    sections: [
      {
        heading: "Record the work",
        body: "Keep dates for field visits, planting, harvesting and any inputs used. Record who provided technical advice. These notes help distinguish a one-off problem from a repeated pattern.",
      },
      {
        heading: "Record the lot",
        body: "For every harvested lot, note its field, date, weight, buyer and agreed quality terms. Keep different lots identifiable through storage and sale.",
      },
      {
        heading: "Compare real returns",
        body: "Compare the price received after transport, processing and other costs. Market prices shown as sample data are training examples and cannot be used as a trading quotation.",
      },
    ],
    quiz: {
      question: "Which figure helps compare two buyers fairly?",
      options: [
        "The highest advertised price only",
        "Net proceeds after costs and agreed quality terms",
        "The nearest buyer name",
      ],
      answerIndex: 1,
      explanation:
        "Costs, quality requirements and payment terms affect what a farmer receives.",
    },
  },
  {
    id: "cassava-material",
    crop: "Cassava",
    title: "Plan healthy cassava establishment",
    summary:
      "Prepare questions about planting material, field history and local suitability.",
    durationMinutes: 5,
    level: "Getting started",
    ...source,
    sections: [
      {
        heading: "Check the source",
        body: "Ask an extension officer about locally suitable varieties and reputable planting-material sources. Record the variety and supplier. Appearance alone cannot confirm that planting material is disease-free.",
      },
      {
        heading: "Check the field",
        body: "Record field history, drainage and previous crop problems. Discuss these observations with a local adviser before deciding where and when to plant.",
      },
      {
        heading: "Escalate early concerns",
        body: "If plants show unusual leaf changes or poor growth, record the pattern and ask for review. Do not move suspect planting material to another field while awaiting qualified guidance.",
      },
    ],
    quiz: {
      question:
        "Can appearance alone certify planting material is disease-free?",
      options: ["Yes", "No; use a reputable source and qualified guidance"],
      answerIndex: 1,
      explanation:
        "A visual check is useful but does not establish disease-free status.",
    },
  },
  {
    id: "banana-water",
    crop: "Banana",
    title: "Observe water and soil conditions",
    summary:
      "Keep field observations that support drainage and crop-care discussions.",
    durationMinutes: 4,
    level: "Field practice",
    ...source,
    sections: [
      {
        heading: "Notice patterns",
        body: "After rainfall, note areas where water remains and where plants appear stressed. Record how long the water stays and whether the site is close to paths or homes.",
      },
      {
        heading: "Get site-specific advice",
        body: "Ask an extension officer to review crop and drainage concerns. Do not drain wetlands, redirect water to neighbouring land, or apply chemicals based on a general app message.",
      },
      {
        heading: "Follow up",
        body: "Create a dated observation task and record changes. Agribridge reports describe a concern; they are not a confirmed crop-disease or malaria diagnosis.",
      },
    ],
    quiz: {
      question: "What is the best first response to a recurring wet area?",
      options: [
        "Add chemicals without assessment",
        "Record the location and seek a site-specific review",
        "Drain every nearby water body",
      ],
      answerIndex: 1,
      explanation:
        "The right response depends on land use, drainage, environmental protection and local assessment.",
    },
  },
  {
    id: "community-water",
    crop: "Community",
    title: "Report standing water safely",
    summary:
      "Help local teams review environmental concerns without collecting patient information.",
    durationMinutes: 4,
    level: "Community practice",
    sourceTitle: "WHO operational manual on larval source management",
    sourceUrl: "https://www.who.int/publications/i/item/9789240123212",
    reviewStatus: "draft",
    sections: [
      {
        heading: "Report an observation",
        body: "Describe where standing water is present, when it appeared, and whether people can safely access the site. Avoid including patient names, medical details or household-identifying photographs.",
      },
      {
        heading: "Let local teams assess the response",
        body: "Local public-health and environmental teams should assess whether action is appropriate. Do not enter unsafe water, alter wetlands, or add chemicals. A standing-water report does not establish mosquito breeding or malaria transmission.",
      },
      {
        heading: "Prevention needs several measures",
        body: "Environmental management is only one possible component of a locally supervised prevention programme. Follow local health authority advice. Anyone unwell should seek appropriate care; this application cannot diagnose malaria.",
      },
    ],
    quiz: {
      question: "Does a standing-water report confirm a malaria case?",
      options: ["Yes", "No; it records an environmental observation"],
      answerIndex: 1,
      explanation:
        "Environmental reports and verified clinical surveillance are different types of information.",
    },
  },
];
