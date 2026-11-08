/**
 * Quiz questions for the 11 example concepts (`src/lib/demo-data.ts`). Four
 * per concept, so a retake can ask something new. Seeded once per workspace
 * by `seedDemoQuestions` (see service.ts); editable in Admin → Quiz questions.
 */
import type { QuizQuestion } from './quiz.ts';

type Demo = Omit<QuizQuestion, 'id' | 'conceptId'>;

const BANK: Record<string, Demo[]> = {
  arithmetic: [
    { prompt: 'What is 7 × 8?', options: ['54', '56', '63', '48'], answer: '56', explanation: '7 × 8 = 56 (7 × 4 = 28, doubled).' },
    { prompt: 'What is 144 ÷ 12?', options: ['11', '12', '13', '14'], answer: '12', explanation: '12 × 12 = 144.' },
    { prompt: 'What is 15 − 6 + 4?', options: ['5', '13', '17', '25'], answer: '13', explanation: 'Work left to right: 15 − 6 = 9, then 9 + 4 = 13.' },
    { prompt: 'What is 23 + 48?', options: ['61', '71', '72', '81'], answer: '71', explanation: '20 + 40 = 60 and 3 + 8 = 11, so 60 + 11 = 71.' },
  ],
  fractions: [
    { prompt: 'What is 1/2 + 1/4?', options: ['2/6', '3/4', '1/6', '2/4'], answer: '3/4', explanation: 'Use a common denominator: 1/2 = 2/4, and 2/4 + 1/4 = 3/4.' },
    { prompt: 'Which fraction equals 2/3?', options: ['4/6', '3/4', '2/6', '6/4'], answer: '4/6', explanation: 'Multiplying the top and the bottom by 2 gives 4/6.' },
    { prompt: 'What is 3/5 of 10?', options: ['6', '3', '15', '50'], answer: '6', explanation: '10 ÷ 5 = 2, and 3 × 2 = 6.' },
    { prompt: 'Which is larger, 3/8 or 1/2?', options: ['3/8', '1/2', 'They are equal'], answer: '1/2', explanation: '1/2 = 4/8, which is more than 3/8.' },
  ],
  decimals: [
    { prompt: 'What is 0.5 + 0.25?', options: ['0.75', '0.30', '0.525', '7.5'], answer: '0.75', explanation: 'Line up the decimal points: 0.50 + 0.25 = 0.75.' },
    { prompt: 'Which decimal equals 3/4?', options: ['0.34', '0.75', '0.43', '3.4'], answer: '0.75', explanation: '3 ÷ 4 = 0.75.' },
    { prompt: 'What is 1.2 × 10?', options: ['12', '0.12', '1.20', '120'], answer: '12', explanation: 'Multiplying by 10 moves the decimal point one place to the right.' },
    { prompt: 'Which number is the largest?', options: ['0.65', '0.7', '0.099', '0.69'], answer: '0.7', explanation: 'Compare place by place: 0.70 > 0.69 > 0.65 > 0.099.' },
  ],
  'pre-algebra': [
    { prompt: 'If x + 5 = 12, what is x?', options: ['7', '17', '5', '12'], answer: '7', explanation: 'Subtract 5 from both sides: x = 12 − 5 = 7.' },
    { prompt: 'What is 2 + 3 × 4?', options: ['20', '14', '24', '9'], answer: '14', explanation: 'Multiply before adding: 3 × 4 = 12, then 2 + 12 = 14.' },
    { prompt: 'What is 3x when x = 4?', options: ['7', '12', '34', '1'], answer: '12', explanation: '3x means 3 × x, so 3 × 4 = 12.' },
    { prompt: 'Simplify 2a + 3a.', options: ['5a', '6a', '5a²', 'a⁵'], answer: '5a', explanation: 'Like terms add their coefficients: 2 + 3 = 5, so 5a.' },
  ],
  'linear-equations': [
    { prompt: 'Solve 2x + 3 = 11.', options: ['4', '7', '3', '5.5'], answer: '4', explanation: 'Subtract 3: 2x = 8. Divide by 2: x = 4.' },
    { prompt: 'What is the slope of y = 3x − 2?', options: ['3', '−2', '2/3', '1'], answer: '3', explanation: 'In y = mx + b the slope is m, so 3.' },
    { prompt: 'Where does y = 2x + 5 cross the y-axis?', options: ['(0, 5)', '(5, 0)', '(0, 2)', '(2, 5)'], answer: '(0, 5)', explanation: 'On the y-axis x = 0, so y = 5.' },
    { prompt: 'Solve 5x − 4 = 3x + 6.', options: ['5', '1', '10', '2'], answer: '5', explanation: 'Subtract 3x: 2x − 4 = 6, so 2x = 10 and x = 5.' },
  ],
  'quadratic-equations': [
    { prompt: 'Solve x² = 9.', options: ['x = 3 only', 'x = 3 or x = −3', 'x = 9', 'x = 4.5'], answer: 'x = 3 or x = −3', explanation: 'Both 3² and (−3)² equal 9.' },
    { prompt: 'Factor x² + 5x + 6.', options: ['(x + 2)(x + 3)', '(x + 1)(x + 6)', '(x − 2)(x − 3)', '(x + 5)(x + 1)'], answer: '(x + 2)(x + 3)', explanation: '2 + 3 = 5 and 2 × 3 = 6.' },
    { prompt: 'Solve (x − 1)(x + 4) = 0.', options: ['x = 1 or x = −4', 'x = −1 or x = 4', 'x = 1 or x = 4', 'x = −4 only'], answer: 'x = 1 or x = −4', explanation: 'A product is 0 when one factor is 0: x − 1 = 0 or x + 4 = 0.' },
    { prompt: 'In ax² + bx + c = 0, what does b² − 4ac < 0 mean?', options: ['Two real solutions', 'One real solution', 'No real solutions', 'Infinitely many solutions'], answer: 'No real solutions', explanation: 'A negative discriminant has no real square root, so there is no real solution.' },
  ],
  'programming-basics': [
    { prompt: 'After x = 5 and then x = x + 2, what is x?', options: ['7', '5', '2', '52'], answer: '7', explanation: 'The right side is worked out first (5 + 2 = 7) and stored back in x.' },
    { prompt: 'Which of these values is a string?', options: ['"42"', '42', 'true', '4.2'], answer: '"42"', explanation: 'Quotes make it text (a string), even though it looks like a number.' },
    { prompt: 'What does a variable do?', options: ['Stores a value under a name', 'Repeats code', 'Prints text on the screen', 'Stops the program'], answer: 'Stores a value under a name', explanation: 'A variable names a value so the program can use and change it later.' },
    { prompt: 'What is the type of the value true?', options: ['Boolean', 'String', 'Integer', 'List'], answer: 'Boolean', explanation: 'true and false are the two Boolean values.' },
  ],
  'control-flow': [
    { prompt: 'How many times does the body of "for i in range(3)" run?', options: ['2', '3', '4', 'Forever'], answer: '3', explanation: 'range(3) gives 0, 1 and 2: three values.' },
    { prompt: 'With x = 10, what does "if x > 5: print("big") else: print("small")" print?', options: ['big', 'small', 'Both', 'Nothing'], answer: 'big', explanation: '10 > 5 is true, so only the if branch runs.' },
    { prompt: 'Which loop keeps running while a condition stays true?', options: ['while', 'if', 'else', 'return'], answer: 'while', explanation: 'A while loop checks its condition before every pass.' },
    { prompt: 'What does break do inside a loop?', options: ['Leaves the loop right away', 'Skips to the next pass', 'Restarts the loop', 'Ends the whole program'], answer: 'Leaves the loop right away', explanation: 'break exits the innermost loop; continue is the one that skips to the next pass.' },
  ],
  functions: [
    { prompt: 'Given "def double(n): return n * 2", what is double(4)?', options: ['8', '4', '6', '42'], answer: '8', explanation: 'The argument 4 becomes n, and the function returns 4 * 2.' },
    { prompt: 'What is a parameter?', options: ['A name for an input the function receives', 'The value the function gives back', 'A loop inside a function', 'A comment'], answer: 'A name for an input the function receives', explanation: 'Parameters are the names in the definition; the values passed in are arguments.' },
    { prompt: 'What does return do?', options: ['Ends the function and hands back a value', 'Prints a value', 'Runs the function again', 'Declares a variable'], answer: 'Ends the function and hands back a value', explanation: 'return stops the function and gives its result to the caller.' },
    { prompt: 'Why write a function?', options: ['To reuse the same steps by name', 'To make code run only once', 'To store many values in order', 'To stop a loop'], answer: 'To reuse the same steps by name', explanation: 'Functions package steps so they can be reused and tested on their own.' },
  ],
  'data-structures': [
    { prompt: 'Which structure looks values up by key, like a phone book?', options: ['Dictionary (map)', 'List', 'Stack', 'Queue'], answer: 'Dictionary (map)', explanation: 'A dictionary maps each key to a value for fast lookup.' },
    { prompt: 'In the list [10, 20, 30], what is at index 1?', options: ['10', '20', '30', 'An error'], answer: '20', explanation: 'Indexes start at 0, so index 1 is the second item.' },
    { prompt: 'Which structure is last in, first out?', options: ['Stack', 'Queue', 'Dictionary', 'Set'], answer: 'Stack', explanation: 'A stack takes items off the top: the last one added comes out first.' },
    { prompt: 'What does a set guarantee?', options: ['Each value appears at most once', 'Values keep their insertion order', 'Values are sorted', 'Values are numbers'], answer: 'Each value appears at most once', explanation: 'A set drops duplicates; in general it does not promise any order.' },
  ],
  algorithms: [
    { prompt: 'Binary search only works when the list is…', options: ['Sorted', 'Short', 'Made of numbers', 'Free of duplicates'], answer: 'Sorted', explanation: 'It halves the range by comparing with the middle item, which only works on sorted data.' },
    { prompt: 'At most how many comparisons does binary search need for 1,000 sorted items?', options: ['About 10', 'About 100', 'About 500', '1,000'], answer: 'About 10', explanation: 'Each step halves the range, and 2¹⁰ = 1,024 ≥ 1,000.' },
    { prompt: 'What is the time complexity of checking every item once (linear search)?', options: ['O(n)', 'O(1)', 'O(log n)', 'O(n²)'], answer: 'O(n)', explanation: 'The work grows in direct proportion to the number of items.' },
    { prompt: 'Which sort repeatedly swaps neighbouring items that are out of order?', options: ['Bubble sort', 'Merge sort', 'Binary search', 'Quickselect'], answer: 'Bubble sort', explanation: 'Bubble sort walks the list swapping adjacent pairs until no swap is needed.' },
  ],
};

export const DEMO_QUESTIONS: QuizQuestion[] = Object.entries(BANK).flatMap(([conceptId, questions]) =>
  questions.map((q, i) => ({ id: `demo-${conceptId}-${i + 1}`, conceptId, ...q })),
);
