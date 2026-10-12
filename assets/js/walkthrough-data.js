// Content for the real-robot walkthrough. Times in `src` / `capture` are seconds
// in the ORIGINAL third-person recordings ("coke grapes part 1/2.MP4"); the player
// maps them onto the condensed clips with the segment file (gaps there are cuts).
// Memory contents are illustrative (see the label in index.html).
window.WT_DATA = {
  segments: 'data/real_segments_v2.json',
  clips: {
    experience: { name: 'coke_experience_v2', src: 'media/real/coke_experience_v2.mp4', poster: 'media/real/coke_experience_v2.jpg' },
    execution: { name: 'coke_execution_v2', src: 'media/real/coke_execution_v2.mp4', poster: 'media/real/coke_execution_v2.jpg' },
  },
  instruction: 'Throw away the soda can.',
  request: 'Bring me the fruit that was next to the soda can.',
  // Part of the execution clip shown while the user asks.
  requestSrc: [14.6, 22],

  steps: [
    {
      skill: 'observe', args: '', src: [7.3, 9.9], capture: 9.8, frame: 'media/real/head/F0.jpg',
      text: '[id 13] person in room. [id 7] table holds [id 14] soda_can, [id 11] grapes, [id 12] banana, [id 15] peach, [id 17] apple, [id 8] plate ([id 5] lemon).',
      desc: 'A person sits in an office chair facing the robot, in front of a plain white wall and a wooden door.',
      graph: [{ parent: ['table', 7], rel: 'on', kids: [['soda_can', 14], ['grapes', 11], ['+5']] }],
    },
    {
      skill: 'navigate_to', args: 'soda_can', src: [9.9, 20.2], capture: 20.1, frame: 'media/real/head/F1.jpg',
      text: 'Arrived at [id 7] table; [id 14] soda_can within reach.',
      desc: 'A white table up close: a yellow banana, a peach, a gold-colored can, an orange plate with a lemon, a red apple, and dark purple grapes.',
      graph: [{ parent: ['table', 7], rel: 'on', kids: [['soda_can', 14], ['grapes', 11], ['+5']] }],
    },
    {
      skill: 'pick', args: 'soda_can', src: [69, 110.1], capture: 110, frame: 'media/real/head/F2.jpg',
      text: 'Picked up [id 14] soda_can from [id 7] table. Holding [id 14] soda_can.',
      desc: 'The right gripper holds a gold can above the white table, which still has a banana, a peach, a red apple, grapes, and an orange plate.',
      graph: [
        { parent: ['table', 7], rel: 'on', kids: [['grapes', 11], ['+5']] },
        { parent: ['robot'], rel: 'held', kids: [['soda_can', 14]] },
      ],
    },
    {
      skill: 'navigate_to', args: 'trash_can', src: [125.9, 137.3], capture: 137.2, frame: 'media/real/head/F3.jpg',
      text: 'Arrived at [id 9] trash_can, holding [id 14] soda_can.',
      desc: 'A gray-lined trash bin on dark carpet beside the white table; the robot’s right gripper still holds the gold can.',
      graph: [
        { parent: ['table', 7], rel: 'on', kids: [['grapes', 11], ['+5']] },
        { parent: ['robot'], rel: 'held', kids: [['soda_can', 14]] },
      ],
    },
    {
      skill: 'place', args: 'trash_can', src: [209.5, 251.6], capture: 251.3, frame: 'media/real/head/F4.jpg',
      text: 'Placed [id 14] soda_can in [id 9] trash_can. Task completed.',
      desc: 'The grippers are open above the trash bin and the can is gone. The table holds grapes, a banana, a peach, an apple, and a plate with a lemon.',
      graph: [
        { parent: ['table', 7], rel: 'on', kids: [['grapes', 11], ['+5']] },
        { parent: ['trash_can', 9], rel: 'in', kids: [['soda_can', 14]] },
      ],
    },
  ],

  // Illustrative 3D positions (map frame, metres) shown in scene-graph tooltips.
  positions: {
    soda_can: [1.36, 0.42, 0.78], grapes: [1.37, 0.31, 0.76], plate: [1.47, 0.18, 0.75],
    banana: [1.58, 0.36, 0.76], peach: [1.66, 0.12, 0.77], apple: [1.44, -0.05, 0.77], lemon: [1.47, 0.18, 0.79],
  },

  // Request-phase actions: one open-loop plan, executed after the memory lookup.
  plan: [
    { skill: 'navigate_to', args: 'grapes', src: [22, 34.9] },
    { skill: 'pick', args: 'grapes', src: [65, 107.1] },
    { skill: 'navigate_to', args: 'user', src: [120.3, 138.6] },
    { skill: 'give_to_user', args: '', src: [149.4, 151.2] },
  ],

  // The agent inspects memory one modality at a time (durations in seconds).
  inspect: [
    {
      mod: 'text', label: 'Text records', dur: 6, ok: false,
      short: 'No positions recorded',
      verdict: 'Lists what was on the table, but not where anything was. Nothing says which fruit was next to the can.',
      highlight: ['soda_can'],
    },
    {
      mod: 'desc', label: 'Descriptions', dur: 6, ok: false, show: [1, 2],
      short: 'Nothing on what stood next to the can',
      verdict: 'Names the can and every fruit, but never says what stood next to the can.',
      highlight: ['gold-colored can', 'gold can'],
    },
    {
      mod: 'image', label: 'Frames', dur: 7.5, ok: true, step: 1,
      short: 'Grapes, right beside the can',
      verdict: 'The stored frame shows the grapes right beside the can.',
      answer: 'grapes',
    },
  ],
};
