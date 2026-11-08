/**
 * Lesson content for the example mathematics concepts (decision D6: basic
 * mathematics is the first complete subject). Each concept has an
 * explanation, a worked example and a practice exercise with its solution;
 * the quiz comes from the question bank. Seeded once per workspace by
 * `seedDemoContent`; editable in Admin → Lesson Content.
 */
import type { ContentItem } from './content.ts';

type Demo = Omit<ContentItem, 'id' | 'conceptId' | 'url' | 'language' | 'source' | 'position'>;

const MATH: Record<string, Demo[]> = {
  arithmetic: [
    {
      kind: 'text',
      title: 'The four operations',
      minutes: 3,
      solution: '',
      body: `Arithmetic is about four operations: **addition** (+), **subtraction** (−), **multiplication** (×) and **division** (÷).

- Multiplication is repeated addition: 4 × 3 = 3 + 3 + 3 + 3 = 12.
- Division asks "how many groups?": 12 ÷ 3 = 4, because 4 × 3 = 12.
- Subtraction undoes addition, and division undoes multiplication.

When an expression mixes them, multiply and divide **before** adding and subtracting, and work from left to right among operations of the same kind. Brackets come first of all.`,
    },
    {
      kind: 'example',
      title: 'Worked example: 18 − 6 ÷ 2 + 4',
      minutes: 2,
      solution: '',
      body: `1. Division first: 6 ÷ 2 = 3, so the expression becomes 18 − 3 + 4.
2. Then left to right: 18 − 3 = 15, and 15 + 4 = **19**.

A common mistake is to work strictly left to right: (18 − 6) ÷ 2 + 4 = 10. That would need brackets around 18 − 6.`,
    },
    {
      kind: 'exercise',
      title: 'Practice',
      minutes: 3,
      body: `Work these out without a calculator:

- 9 × 7
- 56 ÷ 8
- 20 − 4 × 3
- (20 − 4) × 3`,
      solution: `- 9 × 7 = 63
- 56 ÷ 8 = 7 (because 7 × 8 = 56)
- 20 − 4 × 3 = 20 − 12 = 8 (multiply first)
- (20 − 4) × 3 = 16 × 3 = 48 (brackets first)`,
    },
  ],
  fractions: [
    {
      kind: 'text',
      title: 'What a fraction means',
      minutes: 3,
      solution: '',
      body: `A fraction such as 3/4 means "3 parts out of 4 equal parts". The bottom number (**denominator**) says how many equal parts the whole is cut into; the top number (**numerator**) says how many of them you have.

- Equivalent fractions: multiply or divide top and bottom by the same number. 1/2 = 2/4 = 4/8.
- Adding: first give both fractions the same denominator, then add the tops. 1/3 + 1/6 = 2/6 + 1/6 = 3/6 = 1/2.
- Multiplying: multiply the tops and the bottoms. 2/3 × 3/4 = 6/12 = 1/2.`,
    },
    {
      kind: 'example',
      title: 'Worked example: 2/5 + 1/4',
      minutes: 2,
      solution: '',
      body: `1. The denominators differ (5 and 4). A common denominator is 20, because 5 × 4 = 20.
2. Rewrite: 2/5 = 8/20 and 1/4 = 5/20.
3. Add the tops: 8/20 + 5/20 = **13/20**.

Adding tops and bottoms directly (2/5 + 1/4 = 3/9) is the classic mistake: a fifth and a quarter are pieces of different sizes.`,
    },
    {
      kind: 'exercise',
      title: 'Practice',
      minutes: 3,
      body: `- Simplify 6/9.
- Work out 1/2 + 1/3.
- Work out 3/4 of 20.`,
      solution: `- 6/9 = 2/3 (divide top and bottom by 3)
- 1/2 + 1/3 = 3/6 + 2/6 = 5/6
- 3/4 of 20 = 20 ÷ 4 × 3 = 15`,
    },
  ],
  decimals: [
    {
      kind: 'text',
      title: 'Place value after the point',
      minutes: 3,
      solution: '',
      body: `Decimals extend place value to the right of the point: tenths, hundredths, thousandths. In 3.47 there are 3 ones, 4 tenths and 7 hundredths.

- To add or subtract, line up the decimal points (write 2.5 as 2.50 if it helps).
- Multiplying by 10 moves every digit one place to the left: 3.47 × 10 = 34.7.
- A fraction becomes a decimal by dividing: 3/8 = 3 ÷ 8 = 0.375.

To compare decimals, compare place by place from the left: 0.7 is larger than 0.65, because 7 tenths beat 6 tenths.`,
    },
    {
      kind: 'example',
      title: 'Worked example: 4.6 + 0.85',
      minutes: 2,
      solution: '',
      body: `1. Line up the points: 4.60 + 0.85.
2. Hundredths: 0 + 5 = 5. Tenths: 6 + 8 = 14, write 4 carry 1. Ones: 4 + 0 + 1 = 5.
3. Result: **5.45**.`,
    },
    {
      kind: 'exercise',
      title: 'Practice',
      minutes: 3,
      body: `- 1.25 + 0.5
- Write 1/5 as a decimal.
- Which is larger, 0.09 or 0.1?`,
      solution: `- 1.25 + 0.50 = 1.75
- 1/5 = 1 ÷ 5 = 0.2
- 0.1 is larger: 1 tenth (0.10) is more than 9 hundredths (0.09).`,
    },
  ],
  'pre-algebra': [
    {
      kind: 'text',
      title: 'Letters that stand for numbers',
      minutes: 3,
      solution: '',
      body: `A **variable** is a letter that stands for a number. 3x means 3 × x, so when x = 5, 3x = 15.

- **Like terms** have the same letter part and can be combined: 2a + 5a = 7a, but 2a + 5b stays as it is.
- An **equation** says two things are equal. Solving it means finding the value that makes it true.
- Whatever you do to one side of an equation, do to the other side too.

The order of operations still applies: in 2 + 3x with x = 4, multiply first: 2 + 12 = 14.`,
    },
    {
      kind: 'example',
      title: 'Worked example: x − 7 = 12',
      minutes: 2,
      solution: '',
      body: `1. x has 7 taken away. Undo that by adding 7 to **both** sides: x − 7 + 7 = 12 + 7.
2. So **x = 19**.
3. Check: 19 − 7 = 12 ✓`,
    },
    {
      kind: 'exercise',
      title: 'Practice',
      minutes: 3,
      body: `- Simplify 4y + 2 + 3y.
- Find 5n − 1 when n = 3.
- Solve x + 9 = 15.`,
      solution: `- 4y + 3y + 2 = 7y + 2
- 5 × 3 − 1 = 14
- x = 15 − 9 = 6`,
    },
  ],
  'linear-equations': [
    {
      kind: 'text',
      title: 'Solving and graphing straight lines',
      minutes: 4,
      solution: '',
      body: `A linear equation has no powers above 1, such as 3x + 4 = 19. Solve it by undoing operations in reverse order: first the + 4, then the × 3. x = (19 − 4) ÷ 3 = 5.

The graph of y = mx + b is a straight line:

- **m** is the slope: how much y goes up when x goes up by 1.
- **b** is where the line crosses the y-axis (at x = 0).

So y = 2x + 1 crosses the y-axis at (0, 1) and rises 2 for every step of 1 to the right.`,
    },
    {
      kind: 'example',
      title: 'Worked example: 4x − 3 = 2x + 9',
      minutes: 3,
      solution: '',
      body: `1. Gather the x terms on one side: subtract 2x from both sides → 2x − 3 = 9.
2. Undo the − 3: add 3 to both sides → 2x = 12.
3. Undo the × 2: divide both sides by 2 → **x = 6**.
4. Check: 4 × 6 − 3 = 21 and 2 × 6 + 9 = 21 ✓`,
    },
    {
      kind: 'exercise',
      title: 'Practice',
      minutes: 4,
      body: `- Solve 3x + 2 = 17.
- Solve 7 − x = 2.
- What are the slope and the y-intercept of y = −x + 4?`,
      solution: `- 3x = 15, so x = 5
- −x = −5, so x = 5
- Slope −1 (the line goes down 1 for every step right), y-intercept 4, the point (0, 4)`,
    },
  ],
  'quadratic-equations': [
    {
      kind: 'text',
      title: 'Equations with x²',
      minutes: 4,
      solution: '',
      body: `A quadratic equation can be written as ax² + bx + c = 0 with a ≠ 0. It can have two, one or no real solutions.

Two common ways to solve it:

- **Factoring**: write it as a product, then use "a product is 0 only when a factor is 0". x² − 5x + 6 = (x − 2)(x − 3), so x = 2 or x = 3.
- **The quadratic formula**: x = (−b ± √(b² − 4ac)) / 2a. It always works.

The **discriminant** b² − 4ac tells you how many real solutions there are: positive → two, zero → one, negative → none.`,
    },
    {
      kind: 'example',
      title: 'Worked example: x² + 2x − 8 = 0',
      minutes: 3,
      solution: '',
      body: `1. Look for two numbers that multiply to −8 and add to 2: 4 and −2.
2. Factor: (x + 4)(x − 2) = 0.
3. So x + 4 = 0 or x − 2 = 0, giving **x = −4 or x = 2**.
4. Check x = 2: 4 + 4 − 8 = 0 ✓`,
    },
    {
      kind: 'exercise',
      title: 'Practice',
      minutes: 4,
      body: `- Solve x² − 16 = 0.
- Factor x² + 7x + 12 and solve x² + 7x + 12 = 0.
- How many real solutions does x² + x + 1 = 0 have?`,
      solution: `- x² = 16, so x = 4 or x = −4
- (x + 3)(x + 4) = 0, so x = −3 or x = −4
- None: the discriminant is 1² − 4 × 1 × 1 = −3, which is negative`,
    },
  ],
};

export const DEMO_CONTENT: ContentItem[] = Object.entries(MATH).flatMap(([conceptId, items]) =>
  items.map((item, i) => ({
    ...item,
    id: `demo-${conceptId}-${item.kind}`,
    conceptId,
    url: null,
    language: 'en',
    source: 'LearnGraph example content',
    position: i,
  })),
);
