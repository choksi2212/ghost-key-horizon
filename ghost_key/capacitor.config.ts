import { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
	appId: "com.ghostkey.mobile",
	appName: "Ghost Key",
	webDir: "out",
	bundledWebRuntime: false,
	server: {
		androidScheme: "https",
	},
}

export default config


