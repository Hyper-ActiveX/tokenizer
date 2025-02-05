const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { encoding_for_model } = require('tiktoken');
require('dotenv').config();
const axios = require('axios'); // Import axios

const app = express();
const PORT = process.env.PORT || 3001; 
const SLACK_URL = process.env.SLACK_WEBHOOK_URL;

// Middleware for CORS
app.use(cors());

// Middleware to parse JSON
// app.use(bodyParser.json());
app.use(bodyParser.json({ limit: '50mb' })); // Adjust the limit as needed
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// GPT Model Pricing
const MODEL_PRICING = {
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.150, output: 0.600 },
};

// Token Calculator API
app.post('/calculate', (req, res) => {
  try {
    console.log('Request received for /calculate');
    const { qaPairs, prompts, model, outputTokens } = req.body;
    // console.log(qaPairs, prompts, model, outputTokens);

    // Validate input
    if (!qaPairs || !prompts || !model) {
      return res.status(400).json({ error: 'Invalid input. All fields are required.' });
    }
    if (!MODEL_PRICING[model]) {
      return res.status(400).json({ error: 'Invalid model. Supported models: ' + Object.keys(MODEL_PRICING).join(', ') });
    }

    // Initialize tokenizer
    let encoding;
    try {
      encoding = encoding_for_model(model);
    } catch (error) {
      // Fallback for unsupported models
      console.warn(`Model "${model}" is not directly supported by tiktoken. Using fallback encoding.`);
      encoding = encoding_for_model('gpt-4-turbo');
    }

    // Calculate tokens
    let totalTokens = 0;
    let totalOutputTokens = 0;
    let countTotalEvaluation = 0;

    prompts.forEach((prompt) => {
      let promptTokens = 0;
      qaPairs.forEach(({ question, answer }) => {
        const qaText = `${question} ${answer}`;
        const combinedText = `${qaText} ${prompt}`;
        promptTokens += encoding.encode(combinedText).length;
        totalOutputTokens += outputTokens;
        countTotalEvaluation++;
      });
      console.log("totalOutputTokens", totalOutputTokens)
      totalTokens += promptTokens;
    });


    // Calculate cost
    const modelPricing = MODEL_PRICING[model];
    const inputTokenCost = (((totalTokens)/1000000) * modelPricing.input);
    const outputTokenCost = ((totalOutputTokens/1000000)* modelPricing.output);

    const totalCost = inputTokenCost + outputTokenCost;

    // Response
    res.json({
      model,
      totalTokens,
      totalOutputTokens,
      countTotalEvaluation,
      totalCost: totalCost.toFixed(4),
    });
  } catch (error) {
    console.error('Error calculating tokens:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
