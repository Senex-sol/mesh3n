import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useAuthorization } from "../utils/useAuthorization";
import { NFTData } from "../components/account/account-ui";

export default function BlankScreen() {
  const { selectedAccount } = useAuthorization();

  return (
    <>
      <View style={styles.screenContainer}>
        {selectedAccount ? (
          <NFTData address={selectedAccount.publicKey} />
        ) : (
          <Text variant="titleLarge">No account selected</Text>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    height: "100%",
    padding: 16,
  },
});
