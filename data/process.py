import csv
import json
from statistics import median


def clean_names(name):
    name = name.replace("SOUTH AFRICAN MAINTANANCE AND ESTATE BENEFICIARIES ASSOCIATI", "SOUTH AFRICAN MAINTANANCE AND ESTATE BENEFICIARIES ASSOCIATION")
    name = name.title()
    name = name.replace("'S", "'s")

    return name


def extract_gender(idno):
    return "female" if idno[6] < "5" else "male"

def extract_age(idno):
    birth_year = int(idno[0:2]) + 1900
    if birth_year <= 1901:
        birth_year += 100

    return 2019 - birth_year

parties = {}
for row in csv.DictReader(open("all.csv")):
    party = row["Party name"]
    idno = row["IDNumber"]
    gender = extract_gender(idno)
    age = extract_age(idno)
    
    if not party in parties:
        parties[party] = {
            "male" : 0,
            "female" : 0,
            "ages" : []
        }
    parties[party][gender] += 1
    parties[party]["ages"].append(age)
    
output = []
for party in parties:
    parties[party]["medianAge"] = median(parties[party]["ages"])
    parties[party]["party"] = clean_names(party)
    parties[party]["total"] = len(parties[party]["ages"])
    parties[party]["femaleRatio"] = round(parties[party]["female"] / parties[party]["total"], 2)
    del parties[party]["ages"]
    output.append(parties[party])
output = sorted(output, key=lambda el : el["total"], reverse=True)
print(json.dumps(output, indent=4))
