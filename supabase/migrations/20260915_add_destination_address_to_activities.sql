-- Add destination_address column to activities table if it doesn't exist
ALTER TABLE activities
ADD COLUMN IF NOT EXISTS destination_address TEXT;

-- Add comment for documentation
COMMENT ON COLUMN activities.destination_address IS 'Target recipient wallet address for bridge or transfer transactions';
