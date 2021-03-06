import bodyParser from 'body-parser';
import express from 'express';
import expressWS from 'express-ws';
import {
  AudioInputStream,
  ResultReason,
  SpeechRecognitionResult,
} from '@euirim/microsoft-cognitiveservices-speech-sdk';
import websocketStream from 'websocket-stream/stream';

import { initRecognizer } from '../lib/csr';
import { toArrayBuffer } from '../utils/buffer';
import routes from './routes';
import textToSpeech from '../lib/tts';

const port = 8000;

// Extend express to accomodate websockets
const { app } = expressWS(express(), undefined, {
  wsOptions: {
    perMessageDeflate: false, // improve audio stream stability
  },
});

app.use(
  bodyParser.urlencoded({
    extended: false,
  }),
);
app.use(bodyParser.json());

// Handle CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept',
  );
  next();
});

// Websockets
app.ws('/stt', (ws: any, req: express.Request) => {
  const sdkAudioInputStream = AudioInputStream.createPushStream();
  const recognizer = initRecognizer(sdkAudioInputStream);

  const stream = websocketStream(ws, {
    binary: true,
  });

  recognizer.recognized = (_, e) => {
    // Indicates that recognizable speech was not detected, and that recognition is done.
    if (e.result.reason !== ResultReason.RecognizedSpeech) {
      ws.send(
        JSON.stringify({ status: 'error', error: 'Speech unrecognizable.' }),
      );
      recognizer.close();
    }
  };

  recognizer.recognizeOnceAsync(
    (result: SpeechRecognitionResult) => {
      console.log('Result (RAW):', result);
      console.log(`Result: ${result.text}`);
      ws.send(JSON.stringify({ status: 'ok', text: result.text }));
      recognizer.close();
    },
    () => {
      recognizer.close();
      ws.send(
        JSON.stringify({
          status: 'error',
          error: 'Speech recognition failed due to internal error.',
        }),
      );
    },
  );

  // convert ws to stream

  stream
    .on('data', (data: any) => {
      console.log('Received data!');
      console.log(data.length);
      sdkAudioInputStream.write(toArrayBuffer(data));
    })
    .on('end', () => {
      sdkAudioInputStream.close();
    });
});

app.ws('/tts', (ws: any, req: express.Request) => {
  ws.on('message', (m: any) => {
    if (m.data.text) {
      textToSpeech(m.data.text, ws);
    }
  });
});

// Any other routes (for future expansion)
app.use('/', routes);

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server is running on port ${port}`);
});
