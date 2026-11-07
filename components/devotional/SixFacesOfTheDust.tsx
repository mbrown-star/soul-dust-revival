const FACES = [
  {
    numeral: "I",
    title: "Frailty and Mortality",
    body: "You are a creature. “Yahweh God formed man from the dust of the ground” (Genesis 2:7), and the word after the fall is plain: “For you are dust, and you shall return to dust” (Genesis 3:19). Sometimes the dust is not sin but finiteness — tiredness, aging, the limits of a body that wears out. That is not a sign that God is displeased with you. “He remembers that we are dust” (Psalm 103:14). What you need in that dust is not self-improvement but revival, from the One who has never forgotten what you are made of.",
    refs: "GENESIS 2:7 · GENESIS 3:19 · PSALM 103:14 · ECCLESIASTES 12:7",
  },
  {
    numeral: "II",
    title: "Humiliation and Lowliness",
    body: "“For our soul is bowed down to the dust” (Psalm 44:25). In Scripture, lying in the dust pictures being brought low — loss, shame, oppression, grief. The psalmist cries, “You have brought me into the dust of death” (Psalm 22:15). This dust often comes from suffering, not failure. Even here Lamentations holds out a thread: “Let him put his mouth in the dust, if it is so that there may be hope” (Lamentations 3:29). God draws near not when you soar but when you are pressed into the ground.",
    refs: "PSALM 44:25 · PSALM 22:15 · LAMENTATIONS 3:29",
  },
  {
    numeral: "III",
    title: "Sin and Decay",
    body: "After the fall God told the serpent, “you shall eat dust all the days of your life” (Genesis 3:14). Dust became the food of the cursed. Job said, “I have become like dust and ashes” (Job 30:19). Some dust is inside you: compromise, neglect, unconfessed sin, affections that have drifted. The soul clings to it because sin entangles and habits enslave. Paul felt the weight: “What a wretched man I am! Who will deliver me out of the body of this death?” (Romans 7:24). And he knew the answer: “I thank God through Jesus Christ, our Lord!” (Romans 7:25).",
    refs: "GENESIS 3:14 · JOB 30:19 · PSALM 7:5 · ROMANS 7:24–25",
  },
  {
    numeral: "IV",
    title: "Worldliness",
    body: "Dust stands for what is temporary and passing. Of the rich the psalm says, “when he dies he will carry nothing away” (Psalm 49:17). Isaiah asks, “Why do you spend money for that which is not bread?” (Isaiah 55:2). The soul clings to dust when it fastens onto lesser loves — comfort, approval, control, success — none of which can revive or satisfy. Even good gifts become dust when they take God’s place. Paul’s word is direct: “Set your mind on the things that are above, not on the things that are on the earth” (Colossians 3:2).",
    refs: "PSALM 49:17 · ISAIAH 55:2 · COLOSSIANS 3:2 · JAMES 4:4",
  },
  {
    numeral: "V",
    title: "Death and Despair",
    body: "Sometimes the dust means death drawing near, in body or in spirit. “For my soul is full of troubles. My life draws near to Sheol” (Psalm 88:3). David argued with God from the edge: “Shall the dust praise you? Shall it declare your truth?” (Psalm 30:9). There is a despair so heavy it feels like dying — numb, dry, spent. The good news is that God’s word revives not only the sin-weary soul but the death-weary one. No darkness is too far down for the breath of His word to reach.",
    refs: "PSALM 88:3 · PSALM 30:9 · JOB 17:16",
  },
  {
    numeral: "VI",
    title: "A Place God Delights to Revive",
    body: "Here is the gospel surprise: God often chooses the dust as His starting point. “He raises up the poor out of the dust” (Psalm 113:7). He dwells “with him also who is of a contrite and humble spirit, to revive the spirit of the humble” (Isaiah 57:15). In Ezekiel’s valley the word went out — “You dry bones, hear Yahweh’s word” (Ezekiel 37:4) — and breath came. At a tomb in Bethany Jesus cried, “Lazarus, come out!” (John 11:43). Dust is not the end. It is the ground where resurrection begins.",
    refs: "PSALM 113:7 · ISAIAH 57:15 · EZEKIEL 37:4–5 · JOHN 11:43",
  },
];

const LENS = {
  numeral: "VII",
  title: "The Christ-Centered Lens",
  body: "All of it gathers into one Person. Christ entered the dust: “The Word became flesh, and lived among us” (John 1:14). He carried the curse: “For him who knew no sin he made to be sin on our behalf” (2 Corinthians 5:21). He lay in the dust of death, all the way down. And He rose: “But now Christ has been raised from the dead” (1 Corinthians 15:20). Every kind of dust this book names — frailty, humiliation, sin, worldliness, despair — He answered by going into it and coming up out of it. So when you pray Psalm 119:25, you are praying to the Word made flesh, who came up out of the dust and reaches down to bring you with Him.",
  refs: "JOHN 1:14 · 2 CORINTHIANS 5:21 · 1 CORINTHIANS 15:20",
};

/**
 * The book's own front-matter section, the same for every reader -- not
 * study-specific, so it's hardcoded here rather than pulled from a lesson,
 * matching soul-dust-psalms-365's own devotional_template.html, which
 * hardcodes it for the same reason ("it appears once").
 */
export function SixFacesOfTheDust() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-sans text-xs font-semibold uppercase tracking-wide text-ember-700 mb-2">
          Before You Begin
        </h2>
        <p className="font-serif text-ink">
          Psalm 119:25 prays, &ldquo;My soul clings to the dust; Revive me according to Your word&rdquo; (NKJV). The
          word dust carries more than one weight in Scripture. Naming its faces will help you recognize, day by
          day, which dust is clinging to you &mdash; and where God is reaching into it. Scripture speaks of the dust
          in at least six ways, and answers all six with a seventh.
        </p>
      </div>

      {FACES.map((face) => (
        <div key={face.numeral} className="border-t border-dusk/10 pt-5">
          <p className="font-display text-sm text-ember-700">{face.numeral}</p>
          <h3 className="font-sans font-bold text-lg text-ink mt-0.5 mb-2">{face.title}</h3>
          <p className="font-serif text-ink mb-2">{face.body}</p>
          <p className="font-sans text-[11px] tracking-wide text-moss">{face.refs}</p>
        </div>
      ))}

      <div className="bg-ink text-parchment rounded-xl p-5 mt-4">
        <p className="font-display text-sm text-gold">{LENS.numeral}</p>
        <h3 className="font-sans font-bold text-lg mt-0.5 mb-2">{LENS.title}</h3>
        <p className="font-serif mb-2">{LENS.body}</p>
        <p className="font-sans text-[11px] tracking-wide text-gold">{LENS.refs}</p>
      </div>

      <p className="font-sans text-xs text-moss border-t border-dusk/10 pt-3">
        Soul Dust Revival: A 365-Day Devotional Through the Psalms, Universal Edition. Scripture from the World
        English Bible (public domain); Psalm 119:25 from the NKJV.
      </p>
    </div>
  );
}
