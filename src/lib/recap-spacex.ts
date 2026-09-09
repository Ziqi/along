import type {
  ClassRecap,
  ClassSession,
  CoachCard,
  CoachOption,
  RecapStudy,
  TopicEssay,
} from "./types.ts";
import { packCoach } from "./recap-kit.ts";

export const SPACEX_ID = "ses-spacex-horizon";
export const SPACEX_TITLE = "Long-Term Vision vs Quarterly Pressure";

function opt(label: string, en: string, zh: string, keys: string[]): CoachOption {
  return { label, en, zh, keys };
}

function study(
  en: string,
  zh: string,
  use: string,
  useZh: string,
  example: string,
  exampleZh: string,
): RecapStudy {
  return { en, zh, use, useZh, example, exampleZh };
}

const STARTED = Date.parse("2026-09-07T01:02:00+08:00");

export function spacexRecap(): ClassRecap {
  return {
    title: SPACEX_TITLE,
    lede: "The hour was about a public-company trap: *quarterly earnings* force a ninety-day story, while SpaceX-style work only pays on a five-to-ten-year *time horizon*. The class kept asking who can wait for the *payoff*, and who — especially the *retail investor* — sells the first time a quarter *misses*.",
    ledeZh:
      "这堂课讲的是上市公司的陷阱：季报强迫你每九十天讲一个故事，而 SpaceX 这类事只有在五到十年的时间尺度上才兑现。课上一直在问：谁等得起回报，谁——尤其是散户——会在第一次季报不及预期时卖掉。",
    sections: [
      {
        heading: "Quarterly pressure vs a 5–10 year horizon",
        headingZh: "季报压力对上五到十年的尺度",
        body: "A listed firm is judged every ninety days. *Quarterly earnings* become the only story the room will hear, even when the real work needs a five-to-ten-year *time horizon*. SpaceX could protect that horizon by staying private; Tesla could not. The tension of the hour was not “growth versus caution”. It was calendar versus physics.\n\n1. A quarter asks for a number. A rocket asks for years of ugly tests.\n2. If you narrate the decade in ninety-day slides, you start cutting the decade.\n3. The useful sentence: we are not missing the quarter; we are funding the horizon.",
        bodyZh:
          "上市公司每九十天被审一次。季报变成房间里唯一愿意听的故事，哪怕真正的工作需要五到十年。SpaceX 靠不上市保住这个尺度；Tesla 做不到。这小时的张力不是「要不要增长」，而是日历和物理谁说了算。\n\n1. 一个季度要数字。一支火箭要多年难看的试验。\n2. 如果用九十天的片子讲十年，你就会开始砍掉十年。\n3. 可用的句子：我们不是没交季报，我们是在给时间尺度付钱。",
        table: {
          leftHead: "Quarterly calendar",
          leftHeadZh: "季报日历",
          rightHead: "Five-to-ten-year physics",
          rightHeadZh: "五到十年的物理",
          rows: [
            {
              left: "A listed name must tell a ninety-day story.",
              leftZh: "上市公司必须每九十天讲一个故事。",
              right: "The work only pays on a 5–10 year time horizon.",
              rightZh: "这件事只有在五到十年的尺度上才兑现。",
            },
            {
              left: "Tesla is public, so the quarter rewrites the decade.",
              leftZh: "Tesla 已上市，季报会改写十年。",
              right: "Private SpaceX can protect the horizon.",
              rightZh: "私营的 SpaceX 保得住这个尺度。",
            },
            {
              left: "A retail investor sells the first red quarter.",
              leftZh: "散户会在第一个红季度卖掉。",
              right: "An institution can wait if the mandate says so.",
              rightZh: "机构如果授权里写了尺度，可以等。",
            },
          ],
        },
      },
      {
        heading: "Why public markets punish a long bet",
        headingZh: "公开市场为什么惩罚长线赌注",
        body: "Public markets are not stupid. They are impatient in a specific way: they discount what they cannot mark this quarter. A long bet looks like wasted cash until the *payoff* shows up in one piece — a landing, a reusable booster, a cash-flowing constellation. Until then, every *miss* reads as incompetence, not as a test that had to happen.\n\n1. Analysts can model next quarter. They struggle to model a ten-year learning curve.\n2. The stock becomes a referendum on patience, not on the engineering.\n3. If you cannot name the milestone that will unlock the *payoff*, the market will name a *miss* for you.",
        bodyZh:
          "公开市场并不蠢，它只是用一种很具体的方式没耐心：它会折价那些这个季度标不上价的东西。长线赌注在回报整块出现之前，都像在烧钱——着陆、可重复使用的助推器、能造血的星座。在那之前，每一次不及预期都会被读成无能，而不是一次必须做的试验。\n\n1. 分析师能建下个季度的模型，却很难建十年的学习曲线。\n2. 股价变成对耐心的公投，而不是对工程的公投。\n3. 如果你说不清哪一个里程碑会打开回报，市场就会替你点名一次不及预期。",
        table: null,
      },
      {
        heading: "The retail investor and a miss",
        headingZh: "散户和一次不及预期",
        body: "The class was blunt about who flinches first. A *retail investor* often bought the vision, then watches one *miss* on *quarterly earnings* and sells the story they still believe. Institutions can wait if the *time horizon* is in the mandate. Retail usually cannot: the app shows red, and red feels like a verdict.\n\n1. Retail is not “dumb money”. It is money without a ten-year committee.\n2. A miss is information. A panic sale is a second decision.\n3. Steal this line: I can live with a miss if the *time horizon* has not changed.",
        bodyZh:
          "课上说得很直：谁先松手。散户常常先买下愿景，再看着一次季报不及预期，就把自己还相信的故事卖掉。机构如果时间尺度写进了授权，可以等。散户通常不能：应用显示红色，红色就像判决。\n\n1. 散户不是「傻钱」，只是没有一个十年委员会的钱。\n2. 不及预期是信息。恐慌卖出是第二个决定。\n3. 可拿走的句子：只要时间尺度没变，我可以接受一次不及预期。",
        table: null,
      },
      {
        heading: "The payoff of reusable rockets — and how to say it",
        headingZh: "可重复使用火箭的回报，以及怎么说",
        body: "Reusable hardware is the cleanest example the hour had. Early flights looked expensive and late. The *payoff* was not a prettier launch; it was flying the same booster again, then again, until the marginal cost collapsed. DeepSearch numbers belonged here as facts, not as a second coach card: first Falcon 9 landing in 2015, Block 5 boosters flown into double digits, Starlink turning launches into cash. That is a decade, not a quarter.\n\n1. Name the mechanism: reuse, not “innovation”.\n2. Name the wait: years of *misses* before the curve bends.\n3. In class English: the *payoff* arrives late, then all at once.",
        bodyZh:
          "可重复使用的硬件是这小时最干净的例子。早期飞行又贵又晚。回报不是更好看的发射，而是同一枚助推器再飞、再飞，直到边际成本塌下来。检索到的数字应当作为事实进这一段，而不是再抄一张教练卡：2015 年 Falcon 9 首次着陆，Block 5 助推器飞进两位数，Starlink 把发射变成现金。这是十年，不是一个季度。\n\n1. 点出机制：重复使用，不是空说创新。\n2. 点出等待：曲线拐弯之前，会有多年不及预期。\n3. 课上英语：回报来得晚，然后一次性到齐。",
        table: null,
      },
    ],
    outline: [
      {
        heading: "Quarterly pressure vs a 5–10 year horizon",
        bullets: [
          "Ninety-day story versus a decade of tests",
          "Private SpaceX could protect the horizon; a listed name could not",
        ],
      },
      {
        heading: "Why public markets punish a long bet",
        bullets: [
          "They discount what they cannot mark this quarter",
          "A miss reads as incompetence until the payoff lands",
        ],
      },
      {
        heading: "The retail investor and a miss",
        bullets: [
          "Retail bought the vision and sells the first red quarter",
          "A miss is information; a panic sale is a second decision",
        ],
      },
      {
        heading: "The payoff of reusable rockets",
        bullets: [
          "Reuse collapses marginal cost after years of ugly flights",
          "Say the payoff arrives late, then all at once",
        ],
      },
    ],
    topics: [
      { en: "quarterly earnings", zh: "季报 / 季度业绩" },
      { en: "time horizon", zh: "时间尺度" },
      { en: "payoff", zh: "回报 / 兑现" },
      { en: "retail investor", zh: "散户" },
      { en: "reusable rockets", zh: "可重复使用火箭" },
    ],
    takeaways: [
      {
        en: "Quarterly earnings force a ninety-day story; the work may need a 5–10 year time horizon.",
        zh: "季报强迫九十天的故事；真正的工作可能需要五到十年的尺度。",
      },
      {
        en: "Public markets punish a long bet until the payoff can be marked.",
        zh: "公开市场会惩罚长线赌注，直到回报能被标上价。",
      },
      {
        en: "A retail investor often sells the first miss, even if the vision is unchanged.",
        zh: "散户常常在第一次不及预期时卖掉，哪怕愿景没变。",
      },
      {
        en: "Say it in class: I can live with a miss if the time horizon has not changed.",
        zh: "课上就这么说：只要时间尺度没变，我可以接受一次不及预期。",
      },
    ],
    words: [
      study(
        "quarterly earnings",
        "季报 / 季度业绩",
        "The ninety-day score the market treats as the whole story.",
        "市场当成全部故事的九十天成绩单。",
        "Quarterly earnings forced a smaller story than the rocket needed.",
        "季报逼出的故事，比火箭需要的故事更小。",
      ),
      study(
        "time horizon",
        "时间尺度 / 投资期限",
        "How far out you are willing to wait before you judge the work.",
        "你愿意等多久，才对这件事下判断。",
        "A five-to-ten-year time horizon does not fit a ninety-day slide.",
        "五到十年的时间尺度，装不进九十天的片子。",
      ),
      study(
        "payoff",
        "回报 / 兑现",
        "The delayed return that arrives after years of ugly tests.",
        "多年难看试验之后才到的那笔回报。",
        "The payoff of reuse was not a prettier launch; it was flying the booster again.",
        "重复使用的回报不是更好看的发射，而是助推器再飞一次。",
      ),
      study(
        "retail investor",
        "散户",
        "An individual buyer who often holds the vision and not the mandate.",
        "个人买家，常常握着愿景，而不是握着授权。",
        "A retail investor may sell the first miss even if the thesis is intact.",
        "散户可能在第一次不及预期时就卖，哪怕论点还在。",
      ),
      study(
        "miss",
        "不及预期",
        "Results come in below the number the room had priced in.",
        "结果低于房间里已经定价的那个数字。",
        "One miss is information; three panic sales are a different class.",
        "一次不及预期是信息；三次恐慌卖出是另一堂课。",
      ),
      study(
        "reusable",
        "可重复使用的",
        "Hardware you fly again so the next launch gets cheaper.",
        "同一套硬件再飞，下一次发射才更便宜。",
        "A reusable booster turns a one-off machine into a fleet.",
        "可重复使用的助推器把一次性机器变成机队。",
      ),
      study(
        "mandate",
        "授权 / 投资任务",
        "The written permission to wait — institutions have it, retail often does not.",
        "写下来的等待许可——机构有，散户常常没有。",
        "If the time horizon is in the mandate, a miss is not a firing offense.",
        "如果时间尺度写进了授权，一次不及预期不是解雇理由。",
      ),
      study(
        "discount",
        "折价",
        "Mark down what you cannot price this quarter.",
        "把这个季度标不上价的东西往下折。",
        "Markets discount a long bet until the payoff is visible.",
        "在回报看得见之前，市场会折价长线赌注。",
      ),
    ],
    collos: [
      study(
        "quarterly earnings",
        "季度业绩",
        "noun phrase the class treated as a trap, not just a report.",
        "课上把它当陷阱，不只是一份报告。",
        "Do not let quarterly earnings rewrite a ten-year plan.",
        "别让季报改写十年计划。",
      ),
      study(
        "time horizon",
        "时间尺度",
        "how long you agree to wait before you judge.",
        "你同意等多久才下判断。",
        "Name the time horizon before you defend the miss.",
        "先说出时间尺度，再为不及预期辩护。",
      ),
      study(
        "long-term vision",
        "长期愿景",
        "the decade-scale claim you are asking people to hold.",
        "你要别人握住的十年级主张。",
        "A long-term vision dies if every slide is a quarter.",
        "如果每页片子都是一个季度，长期愿景就会死。",
      ),
      study(
        "retail investor",
        "散户投资者",
        "the person who buys the story without a committee.",
        "没有委员会、自己买故事的人。",
        "The retail investor felt the miss before the thesis changed.",
        "论点还没变，散户已经先感觉到不及预期。",
      ),
      study(
        "live with a miss",
        "接受一次不及预期",
        "accept a bad quarter without abandoning the horizon.",
        "接受一个坏季度，但不放弃尺度。",
        "I can live with a miss if the time horizon has not changed.",
        "只要时间尺度没变，我可以接受一次不及预期。",
      ),
      study(
        "marginal cost",
        "边际成本",
        "the cost of one more flight after reuse works.",
        "重复使用跑通之后，再飞一次的成本。",
        "Reuse is only a payoff when marginal cost collapses.",
        "只有边际成本塌下来，重复使用才算回报。",
      ),
    ],
    patterns: [
      study(
        "I can live with a miss if …",
        "只要……我可以接受一次不及预期",
        "Defend a bad quarter without sounding careless.",
        "为坏季度辩护，但不显得随便。",
        "I can live with a miss if the time horizon has not changed.",
        "只要时间尺度没变，我可以接受一次不及预期。",
      ),
      study(
        "not X; we are funding Y",
        "不是 X，我们是在给 Y 付钱",
        "Reframe a miss as a payment toward the horizon.",
        "把不及预期说成是在给尺度付钱。",
        "We are not missing the quarter; we are funding the horizon.",
        "我们不是没交季报，我们是在给时间尺度付钱。",
      ),
      study(
        "The payoff arrives late, then all at once.",
        "回报来得晚，然后一次性到齐。",
        "Describe a decade of tests that suddenly compound.",
        "描述突然复利的十年试验。",
        "The payoff of reuse arrived late, then all at once.",
        "重复使用的回报来得晚，然后一次性到齐。",
      ),
      study(
        "until the payoff can be marked",
        "直到回报能被标上价",
        "Explain why the market is harsh before the number exists.",
        "解释为什么在数字出现之前市场很狠。",
        "Markets punish a long bet until the payoff can be marked.",
        "在回报能被标上价之前，市场会惩罚长线赌注。",
      ),
    ],
    grammar: [
      study(
        "if + present, can + verb",
        "条件句：if + 现在时，主句 can",
        "I can live with a miss if the horizon has not changed.",
        "只要尺度没变，我可以接受不及预期。",
        "I can wait if the mandate still says ten years.",
        "只要授权仍写着十年，我可以等。",
      ),
      study(
        "not X; Y",
        "不是 X，而是 Y（纠正对方的框架）",
        "Reject their clock, then name yours.",
        "先否定对方的钟，再说你的钟。",
        "This is not a miss; it is a test we had to buy.",
        "这不是不及预期，这是我们必须买下的试验。",
      ),
      study(
        "until + clause",
        "until + 从句",
        "Hold the pain until the mark exists.",
        "把痛撑到那个标记出现。",
        "They will discount it until the booster flies again.",
        "在助推器再飞之前，他们都会折价。",
      ),
      study(
        "especially + noun",
        "especially + 名词，用来点名谁先松手",
        "Add the person who cannot wait.",
        "补上那个等不起的人。",
        "Especially the retail investor sells the first red quarter.",
        "尤其是散户，会在第一个红季度卖掉。",
      ),
    ],
    lines: [
      study(
        "I can live with a miss if the time horizon has not changed.",
        "只要时间尺度没变，我可以接受一次不及预期。",
        "The line the class wanted to steal.",
        "课上想拿走的那句。",
        "I can live with a miss if the time horizon has not changed.",
        "只要时间尺度没变，我可以接受一次不及预期。",
      ),
      study(
        "We are not missing the quarter; we are funding the horizon.",
        "我们不是没交季报，我们是在给时间尺度付钱。",
        "Reframe the calendar.",
        "改写日历。",
        "We are not missing the quarter; we are funding the horizon.",
        "我们不是没交季报，我们是在给时间尺度付钱。",
      ),
      study(
        "The payoff arrives late, then all at once.",
        "回报来得晚，然后一次性到齐。",
        "Describe reuse without listing features.",
        "讲重复使用，不要报功能。",
        "The payoff arrives late, then all at once.",
        "回报来得晚，然后一次性到齐。",
      ),
      study(
        "A miss is information. A panic sale is a second decision.",
        "不及预期是信息。恐慌卖出是第二个决定。",
        "Separate the fact from the flinch.",
        "把事实和松手分开。",
        "A miss is information. A panic sale is a second decision.",
        "不及预期是信息。恐慌卖出是第二个决定。",
      ),
    ],
    skills: [
      { en: "Name the time horizon first, then the miss.", zh: "先说时间尺度，再说不及预期。" },
      { en: "I can live with a miss if the thesis is unchanged.", zh: "只要论点没变，我可以接受一次不及预期。" },
      { en: "The payoff arrives late, then all at once — give one mechanism.", zh: "回报来得晚、然后一次性到齐——只给一个机制。" },
    ],
    marks: [
      "quarterly earnings",
      "time horizon",
      "payoff",
      "retail investor",
      "miss",
      "reusable",
      "long-term vision",
    ],
    coachPack: spacexCoachPack(),
    draft: false,
    latencyMs: 0,
    at: STARTED + 50 * 60 * 1000,
  };
}

function spacexCoachPack() {
  return packCoach(spacexCoaches(), spacexEssays());
}

function spacexCoaches(): CoachCard[] {
  return [
    {
      id: "coach-horizon",
      topic: "Quarterly pressure vs a 5–10 year horizon",
      topicZh: "季报压力对上五到十年",
      briefEn: "The room is stuck on this quarter. Pull the clock back to five or ten years.",
      briefZh: "房间卡在这个季度。把钟拉回五到十年。",
      move: "join",
      options: [
        opt("同意", "I hear the quarter. I am asking about the five-to-ten-year time horizon.", "我听到这个季度了。我想问的是五到十年的时间尺度。", ["time horizon", "quarter"]),
        opt("对比", "If we only optimize quarterly earnings, we will cut the tests the rocket still needs.", "如果只优化季报，我们就会砍掉火箭还需要的试验。", ["quarterly earnings"]),
        opt("例子", "Can we say what must be true in year five, not just in ninety days?", "我们能不能说清第五年必须成立的事，而不只是九十天？", ["year five"]),
      ],
      extras: [
        opt("延展", "Private companies can hide the ugly years. Public ones have to narrate them.", "私企可以藏起难看的年份。上市的必须讲出来。", ["private", "public"]),
        opt("追深", "Whose clock are we using — the analyst’s, or the engineer’s?", "我们在用谁的钟——分析师的，还是工程师的？", ["clock"]),
      ],
      source: "auto",
      prompt: "long-term vision versus quarterly pressure",
      latencyMs: 0,
      at: STARTED + 12 * 60 * 1000,
    },
    {
      id: "coach-retail",
      topic: "The retail investor and a miss",
      topicZh: "散户和一次不及预期",
      briefEn: "Someone will sell the first red quarter. Say that without mocking them.",
      briefZh: "有人会在第一个红季度卖掉。说出来，但不要嘲讽。",
      move: "answer",
      options: [
        opt("直接答", "A retail investor often bought the vision, then sells the first miss.", "散户常常先买下愿景，再在第一次不及预期时卖掉。", ["retail investor", "miss"]),
        opt("补一层", "A miss is information. A panic sale is a second decision.", "不及预期是信息。恐慌卖出是第二个决定。", ["miss"]),
        opt("举个例", "I can live with a miss if the time horizon has not changed.", "只要时间尺度没变，我可以接受一次不及预期。", ["time horizon"]),
      ],
      extras: [
        opt("延展", "Institutions wait when the mandate says they may. Retail usually may not.", "机构在授权允许时可以等。散户通常不能。", ["mandate"]),
        opt("追深", "The app turns red and it feels like a verdict, not a data point.", "应用变红，那感觉像判决，不像一个数据点。", ["red"]),
      ],
      source: "auto",
      prompt: "who sells after a miss",
      latencyMs: 0,
      at: STARTED + 28 * 60 * 1000,
    },
  ];
}

function spacexEssays(): Record<string, TopicEssay> {
  return {
    "coach-horizon": {
      title: "Falcon 9 reuse and the long payoff",
      contextEn: "The class asked whether a decade of ugly tests can survive a public calendar.",
      contextZh: "课上问：十年难看的试验，能不能活过公开市场的日历。",
      viewEn:
        "Reusable boosters only look cheap after you have already paid for the failures. The first Falcon 9 landing in 2015 did not print a pretty quarter. It unlocked a fleet: the same Block 5 hardware flown again until marginal cost fell and Starlink could buy launches as a cadence, not a stunt.",
      viewZh:
        "可重复使用的助推器只有在你已经为失败付过钱之后，才看起来便宜。2015 年 Falcon 9 首次着陆并没有印出一张好看的季报。它打开的是机队：同一套 Block 5 硬件再飞，直到边际成本下降，Starlink 才能按节奏买发射，而不是当特技。",
      angles: [
        { en: "Reuse is a cost curve, not a slogan.", zh: "重复使用是成本曲线，不是口号。" },
        { en: "The mark the market wanted did not exist in 2015.", zh: "市场想要的那个标记在 2015 年还不存在。" },
      ],
      facts: [
        { en: "First Falcon 9 landing: December 2015.", zh: "Falcon 9 首次着陆：2015 年 12 月。" },
        { en: "Block 5 boosters later flew into double-digit reuse.", zh: "Block 5 助推器后来飞进两位数重复使用。" },
        { en: "Starlink turned launch cadence into a cash customer.", zh: "Starlink 把发射节奏变成了付现客户。" },
        { en: "SpaceX stayed private; Tesla had to narrate every quarter.", zh: "SpaceX 保持私有；Tesla 必须每个季度讲故事。" },
      ],
      qEn: "When did the payoff of reuse become something a market could mark?",
      qZh: "重复使用的回报，什么时候变成市场能标上价的东西？",
      aEn: "Not on the first landing. On the tenth flight of the same booster, when the next launch was no longer a new machine. That is a five-to-ten-year time horizon wearing an engineering costume. Say forty seconds of that, and sit down.",
      aZh: "不是第一次着陆。是同一枚助推器的第十次飞行，下一次发射不再是一台新机器。那是穿着工程外衣的五到十年时间尺度。讲四十秒，然后坐下。",
      say: "",
      frames: [
        { en: "The payoff arrives late, then all at once.", zh: "回报来得晚，然后一次性到齐。" },
        { en: "Name the mechanism: reuse, not innovation.", zh: "点出机制：重复使用，不是创新空话。" },
      ],
      terms: [
        { en: "reusable booster", zh: "可重复使用助推器" },
        { en: "marginal cost", zh: "边际成本" },
        { en: "cadence", zh: "发射节奏" },
      ],
      sources: [],
      latencyMs: 0,
      at: STARTED + 18 * 60 * 1000,
      draft: false,
    },
  };
}

export function spacexTranscript() {
  return [
    {
      en: "Today we are arguing about long-term vision versus quarterly pressure, and SpaceX is the case.",
      zh: "今天我们争的是长期愿景对上季报压力，SpaceX 是例子。",
    },
    {
      en: "A public company is judged every ninety days on quarterly earnings.",
      zh: "上市公司每九十天都要按季报被审一次。",
    },
    {
      en: "The real work, a rocket or a constellation, only pays on a five to ten year time horizon.",
      zh: "真正的工作，火箭或星座，只有在五到十年的时间尺度上才兑现。",
    },
    {
      en: "If you narrate the decade in ninety-day slides, you start cutting the decade.",
      zh: "如果用九十天的片子讲十年，你就会开始砍掉十年。",
    },
    {
      en: "SpaceX stayed private longer so it could protect that horizon. Tesla could not.",
      zh: "SpaceX 更久不上市，是为了保住那个尺度。Tesla 做不到。",
    },
    {
      en: "Public markets discount what they cannot mark this quarter.",
      zh: "公开市场会折价那些这个季度标不上价的东西。",
    },
    {
      en: "A long bet looks like wasted cash until the payoff shows up in one piece.",
      zh: "长线赌注在回报整块出现之前，都像在烧钱。",
    },
    {
      en: "Until then, every miss reads as incompetence, not as a test that had to happen.",
      zh: "在那之前，每一次不及预期都会被读成无能，而不是必须做的试验。",
    },
    {
      en: "Who flinches first? The retail investor often bought the vision and sells the first miss.",
      zh: "谁先松手？散户常常买下愿景，再在第一次不及预期时卖掉。",
    },
    {
      en: "Institutions can wait if the time horizon is in the mandate. Retail usually cannot.",
      zh: "机构如果时间尺度写进了授权，可以等。散户通常不能。",
    },
    {
      en: "A miss is information. A panic sale is a second decision.",
      zh: "不及预期是信息。恐慌卖出是第二个决定。",
    },
    {
      en: "I can live with a miss if the time horizon has not changed.",
      zh: "只要时间尺度没变，我可以接受一次不及预期。",
    },
    {
      en: "Reusable rockets are the clean example. Early flights looked expensive and late.",
      zh: "可重复使用火箭是干净的例子。早期飞行又贵又晚。",
    },
    {
      en: "The payoff was flying the same booster again until the marginal cost collapsed.",
      zh: "回报是同一枚助推器再飞，直到边际成本塌下来。",
    },
    {
      en: "First Falcon 9 landing was 2015. That did not print a pretty quarter.",
      zh: "Falcon 9 首次着陆是 2015 年。那并没有印出一张好看的季报。",
    },
    {
      en: "The payoff arrives late, then all at once. That is the sentence to steal.",
      zh: "回报来得晚，然后一次性到齐。这是要拿走的句子。",
    },
  ];
}

export function spacexSession(): ClassSession {
  const recap = spacexRecap();
  return {
    id: SPACEX_ID,
    title: SPACEX_TITLE,
    classMode: "interactive",
    startedAt: STARTED,
    endedAt: STARTED + 52 * 60 * 1000,
    updatedAt: STARTED + 52 * 60 * 1000,
    sourceId: null,
    sourceTitle: null,
    starred: false,
    starredAt: null,
    notes: [
      {
        id: "jot-spacex-1",
        en: "I can live with a miss if the time horizon has not changed.",
        zh: "只要时间尺度没变，我可以接受一次不及预期。",
        src: "hand",
        at: STARTED + 30 * 60 * 1000,
      },
      {
        id: "jot-spacex-2",
        en: "Retail investor sells the first red quarter.",
        zh: "散户会在第一个红季度卖掉。",
        src: "coach",
        at: STARTED + 32 * 60 * 1000,
      },
    ],
    transcript: spacexTranscript(),
    coaches: spacexCoaches(),
    essays: spacexEssays(),
    segments: [],
    recap,
  };
}

export function spacexContentJson(): Record<string, unknown> {
  const recap = spacexRecap();
  return {
    title: recap.title,
    lede: recap.lede,
    ledeZh: recap.ledeZh,
    outline: recap.outline,
    sections: recap.sections.map((s) => ({
      heading: s.heading,
      headingZh: s.headingZh,
      body: s.body,
      bodyZh: s.bodyZh,
      table: s.table ?? null,
    })),
    topics: recap.topics,
    takeaways: recap.takeaways,
    words: recap.words,
    collos: recap.collos,
    patterns: recap.patterns,
    grammar: recap.grammar,
    lines: recap.lines,
    skills: recap.skills,
    marks: recap.marks,
  };
}
