import { v2 as cloudinary } from 'cloudinary';


// Configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Changed to accept a file buffer directly
const uploadOnCloudinary = async (fileBuffer, resourceType = 'image') => {
    try {
        if (!fileBuffer) {
            console.warn("No file buffer provided for Cloudinary upload.");
            return null;
        }

        // Convert buffer to Data URI (Base64) for Cloudinary upload
        // fileBuffer.mimetype will be something like 'image/jpeg' or 'video/mp4'
        const dataUri = `data:${fileBuffer.mimetype};base64,${fileBuffer.buffer.toString('base64')}`;

        const response = await cloudinary.uploader.upload(dataUri, {
            resource_type: resourceType,
            folder: `ytlite/${resourceType}s`, // e.g., 'ytlite/videos', 'ytlite/images'
        });

        // File has been uploaded successfully
        return response;
    } catch (error) {
        console.error("Error uploading to Cloudinary:", error);
        throw error; // Re-throw the error for the calling function to handle
    }
};

const deleteOnCloudinary = async (public_id, resourceType = 'image') => {
    if (!public_id) {
        console.warn("No public_id provided for Cloudinary deletion.");
        return null;
    }
    try {
        await cloudinary.uploader.destroy(public_id, {
            resource_type: resourceType
        });
        return true;
    } catch (error) {
        console.error("Error deleting from Cloudinary:", error);
        throw error;
    }
};

export { uploadOnCloudinary, deleteOnCloudinary };