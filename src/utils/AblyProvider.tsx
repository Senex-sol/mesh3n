import React, {
  type FC,
  type ReactNode,
  useMemo,
  createContext,
  useContext,
  useState,
  useEffect,
} from "react";
const Ably = require('ably');

export interface AblyProviderProps {
  children: ReactNode;
  apiKey?: string;
}

export interface AblyContextState {
  ablyClient: any; // Ably.Realtime instance
  getChannel: (channelName: string) => any; // Function to get or create a channel
  channels: Record<string, any>; // Store for active channels
}

export const AblyContext = createContext<AblyContextState>(
  {} as AblyContextState
);

export const AblyProvider: FC<AblyProviderProps> = ({
  children,
  apiKey = "JkXk4g.oaE-7A:Mg0FcpPLSHWOc208f7-tdHsG8zxEDoDGlyCWqlDmeoo", // Default API key, consider moving to env variables
}) => {
  const [channels, setChannels] = useState<Record<string, any>>({});
  
  // Create Ably client instance
  const ablyClient = useMemo(() => {
    return new Ably.Realtime(apiKey);
  }, [apiKey]);

  // Function to get or create a channel
  const getChannel = (channelName: string) => {
    if (!channelName) {
      console.warn("Channel name is required");
      return null;
    }

    // Return existing channel if already created
    if (channels[channelName]) {
      return channels[channelName];
    }

    // Create new channel
    const channel = ablyClient.channels.get(channelName);
    
    // Store the channel in state
    setChannels(prevChannels => ({
      ...prevChannels,
      [channelName]: channel
    }));

    return channel;
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      // Close Ably connection when component unmounts
      if (ablyClient && ablyClient.close) {
        ablyClient.close();
      }
    };
  }, [ablyClient]);

  // Listen for connection state changes
  useEffect(() => {
    if (ablyClient) {
      ablyClient.connection.on("connected", () => {
        console.log("Connected to Ably!");
      });

      ablyClient.connection.on("disconnected", () => {
        console.log("Disconnected from Ably");
      });

      ablyClient.connection.on("failed", (err: any) => {
        console.error("Ably connection failed:", err);
      });
    }
  }, [ablyClient]);

  return (
    <AblyContext.Provider value={{ ablyClient, getChannel, channels }}>
      {children}
    </AblyContext.Provider>
  );
};

export function useAbly(): AblyContextState {
  return useContext(AblyContext);
}
