// Starter data. Each starter item is added once, the first time the engine
// sees it, to fill an empty store. After that, everything lives in Netlify Blobs and
// (from Phase 2) is edited in the admin, never in code.

export const DEFAULT_SETTINGS = {
  brandName: "Your Brand",
  ownerName: "",
  ownerRole: "",
  logoUrl: "",
  siteUrl: "",
  colours: {
    background: "#FAF8F4",
    surface: "#FFFFFF",
    ink: "#161616",
    accent: "#F2C14E",
    spark: "#E07A5F",
    sparkAlt: "#81B29A",
  },
  fonts: {
    heading: "Fraunces",
    serif: "Fraunces",
    body: "Inter",
  },
  consent: {
    publishName: "Can we show your name with your testimonial?",
    publishPhoto: "Can we show your photo too?",
    note: "You can change your mind any time. Just send us a message.",
  },
};

export const DEFAULT_FORMS = [
  {
    id: "form_starter",
    slug: "share",
    title: "How was working with us?",
    intro:
      "This takes about three minutes. Your words help the next person find their way here, so thank you for sharing them.",
    ratingPrompt: "First things first. How many stars would you give us?",
    questions: [
      {
        id: "before",
        prompt: "Where were you before we worked together?",
        helper: "What was going on for you? What felt stuck or unclear?",
        required: true,
      },
      {
        id: "changed",
        prompt: "What changed for you?",
        helper: "Big shifts, small wins, anything that surprised you.",
        required: true,
      },
      {
        id: "friend",
        prompt: "What would you tell a friend who's thinking about it?",
        helper: "Say it the way you would over a coffee.",
        required: false,
      },
    ],
    tags: ["clients"],
    thankYou: {
      heading: "Thank you so much",
      message: "Your testimonial has landed safely. Every single one gets read, so this really means a lot.",
      linkLabel: "",
      linkUrl: "",
    },
    theme: {},
  },
];

export const DEFAULT_COLLECTIONS = [
  {
    id: "collection_love",
    slug: "love",
    name: "Wall of Love",
    description: "Every approved testimonial.",
    rule: { tags: [], match: "any" },
    pins: [],
    exclusions: [],
    sort: "featured",
    order: [],
    wall: {
      eyebrow: "Kind words",
      heading: "Wall of Love",
      subheading: "Real words from real clients.",
      showRatings: true,
    },
    createdAt: "2026-10-13T00:00:00.000Z",
    updatedAt: "2026-10-13T00:00:00.000Z",
  },
];
