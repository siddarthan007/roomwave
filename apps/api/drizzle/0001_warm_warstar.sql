ALTER TABLE `activities` ADD `deadline_at` text;--> statement-breakpoint
ALTER TABLE `participants` ADD `display_name` text NOT NULL DEFAULT 'Guest';--> statement-breakpoint
ALTER TABLE `participants` ADD `avatar_seed` text NOT NULL DEFAULT 'roomwave';--> statement-breakpoint
ALTER TABLE `rooms` ADD `settings` text NOT NULL DEFAULT '{"theme":"paper","lobbyMessage":"Find your square. The next round starts here.","allowReactions":true,"allowLateJoin":true,"showPresence":true,"showResponseCount":true,"participantNames":"chosen","maxParticipants":500,"soundMode":"soft"}';
