import { hourlyPromptService } from './hourlyPromptService';
import { promptDatabaseService } from './promptDatabaseService';

export class CronService {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
    this.lastMaintenanceHour = -1;
  }

  // Start the cron service
  start() {
    if (this.isRunning) {
      console.log('Cron service already running');
      return;
    }

    console.log('Starting cron service...');
    this.isRunning = true;

    // Initialize prompts database on start
    this.initializeDatabase();

    // Check every minute for hour changes
    this.intervalId = setInterval(() => {
      this.checkHourlyMaintenance();
    }, 60000); // Check every minute

    // Run initial maintenance
    this.runMaintenance();
  }

  // Stop the cron service
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('Cron service stopped');
  }

  // Initialize the prompts database
  async initializeDatabase() {
    try {
      console.log('Initializing prompts database...');
      const result = await promptDatabaseService.initializePromptsDatabase();
      if (result.success) {
        console.log('Prompts database initialized successfully');
      } else {
        console.error('Failed to initialize prompts database:', result.error);
      }
    } catch (error) {
      console.error('Error initializing database:', error);
    }
  }

  // Check if we need to run hourly maintenance
  async checkHourlyMaintenance() {
    const currentHour = new Date().getHours();
    
    // If hour has changed, run maintenance
    if (currentHour !== this.lastMaintenanceHour) {
      console.log(`Hour changed to ${currentHour}, running maintenance...`);
      await this.runMaintenance();
      this.lastMaintenanceHour = currentHour;
    }
  }

  // Run the hourly maintenance tasks
  async runMaintenance() {
    try {
      console.log('Running scheduled maintenance...');
      
      const maintenanceResult = await hourlyPromptService.hourlyMaintenance();
      
      if (maintenanceResult.success) {
        console.log('Maintenance completed successfully:', {
          cleanedPrompts: maintenanceResult.cleanup?.cleanedCount || 0,
          newPrompt: maintenanceResult.newPrompt?.prompt?.text || 'No new prompt created'
        });
      } else {
        console.error('Maintenance failed:', maintenanceResult.error);
      }
    } catch (error) {
      console.error('Error during maintenance:', error);
    }
  }

  // Manually trigger maintenance (for testing)
  async triggerMaintenance() {
    console.log('Manually triggering maintenance...');
    await this.runMaintenance();
  }

  // Get service status
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastMaintenanceHour: this.lastMaintenanceHour,
      currentHour: new Date().getHours()
    };
  }
}

// Create singleton instance
export const cronService = new CronService();

// Auto-start the service
export const startCronService = () => {
  cronService.start();
};

export const stopCronService = () => {
  cronService.stop();
};

export const triggerManualMaintenance = () => {
  return cronService.triggerMaintenance();
};