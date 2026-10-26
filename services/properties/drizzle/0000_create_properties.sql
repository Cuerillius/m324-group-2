CREATE SCHEMA "properties";
--> statement-breakpoint
CREATE TABLE "properties"."properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"room_count" real NOT NULL,
	"living_area" real NOT NULL,
	"location_id" uuid NOT NULL,
	"asking_price" integer NOT NULL,
	"sale_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
