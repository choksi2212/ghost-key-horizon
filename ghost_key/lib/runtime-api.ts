// Runtime API abstraction that switches between server API routes and on-device implementations

// We reuse existing local libs for models/storage/voice features
import { authenticateWithModel, trainKeystrokeModel } from "@/libs/autoencoder"
// libs/storage.js is JS; import default
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import storage from "@/libs/storage.js"
import { processVoiceAudio, calculateRobustSimilarityScore } from "@/utils/voice-feature-extractor"

type KeystrokeFeatures = {
	features: number[]
	holdTimes: number[]
	ddTimes: number[]
	udTimes: number[]
	typingSpeed: number
	flightTime: number
	errorRate: number
	pressPressure: number
}

function isNative(): boolean {
	return typeof window !== "undefined" && !!(window as any).Capacitor
}

export const RuntimeAPI = {
	isLocal: () => isNative() || process.env.NEXT_PUBLIC_FORCE_LOCAL === "1",

	async trainModel(username: string, features: KeystrokeFeatures, sampleCount: number, privacyMode: boolean) {
		if (!RuntimeAPI.isLocal()) {
			const res = await fetch("/api/train-model", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username,
					features: features.features,
					holdTimes: features.holdTimes,
					ddTimes: features.ddTimes,
					udTimes: features.udTimes,
					additionalFeatures: {
						typingSpeed: features.typingSpeed,
						flightTime: features.flightTime,
						errorRate: features.errorRate,
						pressPressure: features.pressPressure,
					},
					sampleCount,
					privacyMode,
				}),
			})
			const result = await res.json()
			return !!result.success
		}

		// Local implementation: accumulate samples and train when enough
		const origin = "app://ghost-key"
		await storage.storeTrainingSample(origin, username, sampleCount, {
			features: features.features,
			holdTimes: features.holdTimes,
			ddTimes: features.ddTimes,
			udTimes: features.udTimes,
			additional: {
				typingSpeed: features.typingSpeed,
				flightTime: features.flightTime,
				errorRate: features.errorRate,
				pressPressure: features.pressPressure,
			},
			privacyMode,
		})

		const samples = await storage.getTrainingSamples(origin, username)
		if (!samples || samples.length < 5) return true

		const featureVectors: number[][] = samples.map((s: any) => s.features)
		const modelData = await trainKeystrokeModel(featureVectors)
		await storage.storeKeystrokeModel(origin, username, modelData)
		return true
	},

	async authenticate(username: string, features: KeystrokeFeatures, password: string) {
		if (!RuntimeAPI.isLocal()) {
			const res = await fetch("/api/authenticate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					username,
					features: features.features,
					holdTimes: features.holdTimes,
					ddTimes: features.ddTimes,
					udTimes: features.udTimes,
					typingSpeed: features.typingSpeed,
					flightTime: features.flightTime,
					errorRate: features.errorRate,
					pressPressure: features.pressPressure,
					password,
				}),
			})
			return await res.json()
		}

		const origin = "app://ghost-key"
		const modelData = await storage.getKeystrokeModel(origin, username)
		if (!modelData) {
			return { success: false, authenticated: false, reconstructionError: 0, reason: "No biometric profile found" }
		}
		const result = authenticateWithModel(features.features, modelData)
		return result
	},

	async voiceRegister(username: string, samples: Blob[]) {
		if (!RuntimeAPI.isLocal()) {
			const formData = new FormData()
			formData.append("username", username)
			samples.forEach((s, i) => formData.append(`sample_${i}`, s, `voice_sample_${i}.webm`))
			const processed = await Promise.all(samples.map((s) => processVoiceAudio(s)))
			formData.append(
				"features",
				JSON.stringify(
					processed.map((p) => p.features),
				),
			)
			const res = await fetch("/api/voice/register", { method: "POST", body: formData })
			const json = await res.json()
			return !!json.success
		}

		const origin = "app://ghost-key"
		const processed = await Promise.all(samples.map((s) => processVoiceAudio(s)))
		// Average features similar to API route
		const mfccMeans = processed.map((p) => p.features.mfccMean)
		const avg = new Array(mfccMeans[0].length).fill(0)
		for (const v of mfccMeans) for (let i = 0; i < v.length; i++) avg[i] += v[i]
		for (let i = 0; i < avg.length; i++) avg[i] /= mfccMeans.length
		const profile = { template: avg, samples: processed.map((p) => p.features), createdAt: new Date().toISOString() }
		await storage.storeVoiceModel(origin, username, profile)
		return true
	},

	async voiceVerify(username: string, sample: Blob) {
		if (!RuntimeAPI.isLocal()) {
			const formData = new FormData()
			formData.append("username", username)
			formData.append("voice_sample", sample, "voice_verification.webm")
			const { features } = await processVoiceAudio(sample)
			formData.append("features", JSON.stringify(features))
			const res = await fetch("/api/voice/verify", { method: "POST", body: formData })
			const json = await res.json()
			return !!json.success
		}

		const origin = "app://ghost-key"
		const voiceModel = await storage.getVoiceModel(origin, username)
		if (!voiceModel) return false
		const { features } = await processVoiceAudio(sample)
		// Compare using robust similarity
		const comparisons = voiceModel.samples.map((s: any) => calculateRobustSimilarityScore(s, features))
		const best = Math.max(...comparisons.map((c: any) => c.overallSimilarity))
		const threshold = 0.75
		return best >= threshold
	},
}

export default RuntimeAPI


