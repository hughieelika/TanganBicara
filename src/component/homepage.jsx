import React, { useRef, useState, useEffect } from 'react';
import 'tailwindcss/tailwind.css';
import Logo from '../assets/logotanganbicarav2.png';
import Founders from '../assets/founders.png';
import { FiPlayCircle as PlayButton } from "react-icons/fi";

/* global roboflow */
const SignDetection = () => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [loading, setLoading] = useState(false);
    const [isPredictionRunning, setIsPredictionRunning] = useState(false);
    const [fps, setFps] = useState(null);
    const [predictionString, setPredictionString] = useState('');
    const [speechLoading, setSpeechLoading] = useState(false);
    let model = null;
    let prevTime = null;
    const pastFrameTimes = [];
    let animationFrameId = useRef(null).current;;
    let labelCounts = {};
    const lastDetectedRef = useRef('');
    const [audioSrc, setAudioSrc] = useState(null);
    const audioRef = useRef(null);



    const PUBLISHABLE_KEY = process.env.REACT_APP_ROBOFLOW_PUBLISHABLE_KEY;
    const TEXT_TO_SPEECH_API_KEY = process.env.REACT_APP_ROBOFLOW_TEXT_TO_SPEECH_KEY;

    useEffect(() => {
        return () => stopPrediction();
    }, []);

    const startCameraAndModel = async () => {
        setLoading(true);
        await startVideoStream();
        await loadModel();
        setLoading(false);
        setIsPredictionRunning(true);
        resizeCanvas();
        animationFrameId = requestAnimationFrame(detectFrame);
    };

    const startVideoStream = async () => {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: 'environment' }
        });
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        videoRef.current.onloadedmetadata = resizeCanvas;
    };

    const loadModel = async () => {
        const authResponse = await roboflow.auth({ publishable_key: PUBLISHABLE_KEY });
        model = await authResponse.load({ model: 'american-sign-language-v36cz', version: 1 });
    };

    const detectFrame = async () => {
        if (!model || !videoRef.current || videoRef.current.readyState < 2) {
            animationFrameId = requestAnimationFrame(detectFrame);
            return;
        }

        try {
            const predictions = await model.detect(videoRef.current);
            renderPredictions(predictions);
            updatePredictionString(predictions);
            animationFrameId = requestAnimationFrame(detectFrame);


            if (prevTime) {
                pastFrameTimes.push(Date.now() - prevTime);
                if (pastFrameTimes.length > 30) pastFrameTimes.shift();

                const total = pastFrameTimes.reduce((acc, curr) => acc + curr / 1000, 0);
                const fpsValue = pastFrameTimes.length / total;
                setFps(Math.round(fpsValue));
            }
            prevTime = Date.now();
        } catch (error) {
            console.error('Detection Error:', error);
            animationFrameId = requestAnimationFrame(detectFrame);
        }
    };

    const stopPrediction = () => {
        setIsPredictionRunning(false);

        if (animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject;
            const tracks = stream.getTracks();
            tracks.forEach((track) => track.stop());
            videoRef.current.srcObject = null;
        }

        if (model && typeof model.teardown === "function") {
            model.teardown();
        }

        setFps(null);
    };


    const resizeCanvas = () => {
        if (videoRef.current && canvasRef.current) {
            canvasRef.current.width = videoRef.current.videoWidth;
            canvasRef.current.height = videoRef.current.videoHeight;
        }
    };

    const renderPredictions = (predictions) => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        const videoWidth = videoRef.current.videoWidth;
        const videoHeight = videoRef.current.videoHeight;

        ctx.clearRect(0, 0, videoWidth, videoHeight);

        predictions.forEach(({ bbox: { x, y, width, height }, color, class: label, confidence }) => {
            ctx.strokeStyle = color || '#00FF00';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y - 135, width, height);

            ctx.fillStyle = color || '#00FF00';
            const textWidth = ctx.measureText(label).width;
            const textHeight = 16;
            ctx.fillRect(x, y - textHeight - 4, textWidth + 50, textHeight + 4);

            ctx.font = '16px sans-serif';
            ctx.textBaseline = 'top';
            ctx.fillStyle = '#000000';
            ctx.fillText(label, x + 4, y - textHeight);
            ctx.fillText(confidence.toFixed(2), x + textWidth + 10, y - textHeight);
        });
    };

    const updatePredictionString = (predictions) => {
        const confidenceThreshold = 0.7;
        if (predictions.length > 0) {
            const { class: label, confidence } = predictions[0];

            if (confidence >= confidenceThreshold) {
                console.log("Detected:", label);


                if (label !== lastDetectedRef.current) {
                    labelCounts = {};
                    labelCounts[label] = 1;
                    lastDetectedRef.current = label;
                    console.log("LabelCount:", labelCounts);
                } else {

                    labelCounts[label] = (labelCounts[label] || 0) + 1;
                }


                if (labelCounts[label] === 4) {
                    setPredictionString((prevString) => prevString + label);

                    labelCounts = {};
                    lastDetectedRef.current = '';
                }
            }
        }
    };
    const textToSpeech = (text) => {
        return new Promise((resolve, reject) => {
            const options = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'xi-api-key': TEXT_TO_SPEECH_API_KEY },
                body: JSON.stringify({
                    text: text,
                    model_id: "eleven_multilingual_v2",
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.8,
                        style: 0.0,
                        use_speaker_boost: true
                    }
                })
            };

            fetch(`https://api.elevenlabs.io/v1/text-to-speech/OKanSStS6li6xyU1WdXa/stream`, options)
                .then(response => {
                    if (response.ok) {
                        return response.blob();
                    }
                    throw new Error('Network response was not ok.');
                })
                .then(blob => {
                    const audioUrl = URL.createObjectURL(blob);
                    console.log('Audio data received:', blob);
                    resolve(audioUrl);
                })
                .catch(err => {
                    console.error('Error in fetching:', err);
                    reject(err);
                });
        });
    };

    const deletePredictionString = () => {
        setPredictionString('');
    };

    const handleButtonClick = () => {
        if (!isPredictionRunning) {
            startCameraAndModel();
        } else {
            stopPrediction();
            deletePredictionString();
        }
    };

    const handleTextToSpeech = async (text) => {
        try {
            setSpeechLoading(true);
            const audioUrl = await textToSpeech(text);
            setAudioSrc(audioUrl);
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.load();
                audioRef.current.onloadeddata = () => {
                    audioRef.current.play()
                        .catch(e => console.error('Error playing the audio:', e));
                };
            }
            setSpeechLoading(false);
        } catch (error) {
            console.error('Error: Could not generate text-to-speech', error);
            setSpeechLoading(false);
        }
    };

    const addSpaceToPredictionString = () => {
        setPredictionString(prevString => prevString + " ");
    };



    return (
        <div className="relative flex flex-col items-center justify-center min-h-screen w-full main-div p-4">
            <div className="absolute top-20 lg:top-50 md:top-50 w-36 h-36 bg-no-repeat bg-contain z-20  scale-[2]" style={{ backgroundImage: `url(${Logo})` }} />
            <div className={`mt-40 relative bg-tosca p-4 rounded-lg shadow-xl w-full max-w-full md:max-w-3xl ${loading ? 'bg-black' : ''}`}>
                <video ref={videoRef} className="relative w-full aspect-video bg-white rounded-lg" muted autoPlay playsInline />
                <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full" />

                {loading && (
                    <div className="absolute inset-0 flex justify-center items-center">
                        <div className="flex flex-col items-center justify-center">
                            <svg aria-hidden="true" className="w-8 h-8 text-gray-200 animate-spin fill-blue-600" viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="currentColor" />
                                <path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="currentFill" />
                            </svg>
                            <span className="sr-only">Loading...</span>
                            <div className="text-center text-3xl font-bold text-white mt-4">Loading Model...</div>
                        </div>
                    </div>
                )}
            </div>
            <div className="text-black mt-4 z-20">{fps !== null && `${fps} fps`}</div>

            <div className="flex gap-4 mt-4 z-20">
                <button
                    onClick={handleButtonClick}
                    className={`${isPredictionRunning ? 'bg-red-500 hover:bg-red-600' : 'bg-tosca hover:bg-blue-600'} text-white font-bold py-2 px-4 rounded-lg z-10`}
                    disabled={loading}
                >
                    {loading ? 'Loading...' : isPredictionRunning ? 'Stop Prediction' : 'Start Prediction'}
                </button>
                <div>
                    <button
                        className={`bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg z-10 inline-flex items-center ${speechLoading || !predictionString ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={() => handleTextToSpeech(predictionString)}
                        disabled={speechLoading || !predictionString}
                    >
                        {speechLoading ? (
                            <div className="flex flex-col items-center justify-center">
                                <svg aria-hidden="true" className="w-8 h-8 text-gray-200 animate-spin fill-blue-600" viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="currentColor" />
                                    <path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="currentFill" />
                                </svg>
                                <span className="sr-only">Loading...</span>
                            </div>
                        ) : (
                            <span className='inline-flex items-center'>
                                <PlayButton className='mr-2' />Generate Speech
                            </span>
                        )}
                    </button>
                    <audio ref={audioRef} src={audioSrc} controls hidden />
                </div>
            </div>

            <div class="relative bg-white p-4 rounded-lg shadow-xl mt-5 z-20 w-96 h-64 overflow-auto flex flex-col items-center">
                <h2 class="text-3xl text-tosca font-bold mb-2">Prediction</h2>
                <p class="whitespace-pre-wrap">{predictionString || 'No predictions detected'}</p>
                <button
                    onClick={addSpaceToPredictionString}
                    class="absolute bottom-5 bg-tosca text-white font-bold py-2 px-4 rounded-lg mt-5"
                >
                    Add Space
                </button>
            </div>
            <div className="mt-5">
                <img src={Founders} alt="Founders" className="w-full max-w-4xl rounded-lg shadow-lg" />
            </div>
        </div>
    );
};

export default SignDetection;
