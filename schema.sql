-- Create the customers table
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_coach_id UUID REFERENCES auth.users(id),
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable Row Level Security for the customers table
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- RLS policy for SELECT: Work Coach can only select their own customers
CREATE POLICY "Allow work coach to select their own customers"
ON customers
FOR SELECT
USING (auth.uid() = work_coach_id);

-- RLS policy for INSERT: Work Coach can only insert customers for themselves
CREATE POLICY "Allow work coach to insert their own customers"
ON customers
FOR INSERT
WITH CHECK (auth.uid() = work_coach_id);

-- RLS policy for UPDATE: Work Coach can only update their own customers
CREATE POLICY "Allow work coach to update their own customers"
ON customers
FOR UPDATE
USING (auth.uid() = work_coach_id)
WITH CHECK (auth.uid() = work_coach_id);

-- RLS policy for DELETE: Work Coach can only delete their own customers
CREATE POLICY "Allow work coach to delete their own customers"
ON customers
FOR DELETE
USING (auth.uid() = work_coach_id);
