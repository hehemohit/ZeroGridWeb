"""
ZeroGrid DynamoDB Topology Seeding Utility
Populates the single-table 'ZeroGrid-State' with reference electrical topology nodes and edges.
"""

import os
import json
from dotenv import load_dotenv

load_dotenv()

from grid_graph import seed_default_grid_topology, SIMULATION_NODES, SIMULATION_EDGES, TABLE_NAME, AWS_REGION


def main():
    print(f"==================================================")
    print(f"ZeroGrid DynamoDB Seeding Utility")
    print(f"Target Table  : {TABLE_NAME}")
    print(f"Target Region : {AWS_REGION}")
    print(f"==================================================")

    # Export seed items to JSON file for reference / manual AWS Console import
    seed_payload = {
        "nodes": list(SIMULATION_NODES.values()),
        "edges": SIMULATION_EDGES
    }
    json_path = os.path.join(os.path.dirname(__file__), "seed_data.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(seed_payload, f, indent=2)
    print(f"[+] Exported reference items to {json_path}")

    # Attempt cloud seeding
    print(f"[*] Attempting cloud DynamoDB write...")
    res = seed_default_grid_topology()

    if res.get("status") == "SUCCESS":
        print(f"[SUCCESS] {res.get('message')}")
    else:
        print(f"[!] Cloud direct seeding result: {res.get('status')}")
        print(f"    Message: {res.get('message')}")
        print("\nNote: If local AWS IAM credentials lack dynamodb:PutItem permission,")
        print("you can either:")
        print(" 1. Attach 'AmazonDynamoDBFullAccess' or 'ZeroGridDynamoDBPolicy' to your IAM user in AWS IAM.")
        print(" 2. In AWS Console -> DynamoDB -> Tables -> ZeroGrid-State -> 'Explore items' -> 'Create item',")
        print("    paste the items from seed_data.json.")
        print(" 3. Once deployed to AWS Lambda, invoke POST /api/seed-topology on the Lambda URL,")
        print("    which uses the Lambda's attached IAM execution role directly!")


if __name__ == "__main__":
    main()
