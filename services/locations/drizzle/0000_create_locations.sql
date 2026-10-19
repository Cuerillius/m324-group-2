CREATE SCHEMA "locations";
--> statement-breakpoint
CREATE TABLE "locations"."locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"postal_code" text NOT NULL,
	"founding_date" date NOT NULL,
	"population" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_postal_code_unique" UNIQUE("postal_code")
);
