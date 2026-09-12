import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { put } from "@vercel/blob";
import { config } from "dotenv";

// Load environment variables from .env.local
config({ path: ".env.local" });

const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

interface UploadResult {
	filename: string;
	url?: string;
	error?: string;
	success: boolean;
}

if (!BLOB_READ_WRITE_TOKEN) {
	console.error("❌ BLOB_READ_WRITE_TOKEN environment variable is required");
	console.log("📝 Get your token from: https://vercel.com/dashboard/stores");
	process.exit(1);
}

async function uploadJsonFiles() {
	const dataDir = join(process.cwd(), "public", "data");
	const files = readdirSync(dataDir).filter((file) => file.endsWith(".json"));

	console.log(`📁 Found ${files.length} JSON files to upload`);

	const uploadPromises = files.map(async (filename): Promise<UploadResult> => {
		try {
			const filePath = join(dataDir, filename);
			const fileContent = readFileSync(filePath, "utf-8");

			console.log(`⬆️  Uploading ${filename}...`);

			const blob = await put(filename, fileContent, {
				access: "public",
				contentType: "application/json",
			});

			console.log(`✅ Uploaded ${filename} -> ${blob.url}`);
			return { filename, url: blob.url, success: true };
		} catch (error) {
			console.error(`❌ Failed to upload ${filename}:`, error);
			return {
				filename,
				error: error instanceof Error ? error.message : String(error),
				success: false,
			};
		}
	});

	const results = await Promise.all(uploadPromises);

	// Summary
	const successful = results.filter((r) => r.success);
	const failed = results.filter((r) => !r.success);

	console.log("\n📊 Upload Summary:");
	console.log(`✅ Successful: ${successful.length}`);
	console.log(`❌ Failed: ${failed.length}`);

	if (successful.length > 0) {
		console.log("\n🔗 Uploaded files:");
		for (const result of successful) {
			console.log(`  ${result.filename} -> ${result.url}`);
		}
	}

	if (failed.length > 0) {
		console.log("\n💥 Failed uploads:");
		for (const result of failed) {
			console.log(`  ${result.filename}: ${result.error}`);
		}
	}

	// Generate URL mapping for easy integration
	const urlMapping = successful.reduce(
		(acc, result) => {
			const stockCode = result.filename.match(/bubble_data_(.+)_splitadj/)?.[1];
			if (stockCode && result.url) {
				acc[stockCode] = result.url;
			}
			return acc;
		},
		{} as Record<string, string>,
	);

	console.log("\n📋 URL Mapping (copy this for your code):");
	console.log(JSON.stringify(urlMapping, null, 2));
}

uploadJsonFiles().catch(console.error);
